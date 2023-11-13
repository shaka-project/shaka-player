/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SeekBar');

goog.require('shaka.ads.AdManager');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.RangeElement}
 * @implements {shaka.extern.IUISeekBar}
 * @final
 * @export
 */
shaka.ui.SeekBar = class extends shaka.ui.RangeElement {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        [
          'shaka-seek-bar-container',
        ],
        [
          'shaka-seek-bar',
          'shaka-no-propagation',
          'shaka-show-controls-on-mouse-over',
        ]);

    /** @private {!HTMLElement} */
    this.adMarkerContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.adMarkerContainer_.classList.add('shaka-ad-markers');
    // Insert the ad markers container as a first child for proper
    // positioning.
    this.container.insertBefore(
        this.adMarkerContainer_, this.container.childNodes[0]);


    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    /**
     * This timer is used to introduce a delay between the user scrubbing across
     * the seek bar and the seek being sent to the player.
     *
     * @private {shaka.util.Timer}
     */
    this.seekTimer_ = new shaka.util.Timer(() => {
      let newCurrentTime = this.getValue();
      if (!this.player.isLive()) {
        if (newCurrentTime == this.video.duration) {
          newCurrentTime -= 0.001;
        }
      }
      this.video.currentTime = newCurrentTime;
    });


    /**
     * The timer is activated for live content and checks if
     * new ad breaks need to be marked in the current seek range.
     *
     * @private {shaka.util.Timer}
     */
    this.adBreaksTimer_ = new shaka.util.Timer(() => {
      this.markAdBreaks_();
    });

    /**
     * @private {shaka.util.EventManager}
     */
    this.chaptersEventManager_ = new shaka.util.EventManager();


    /** @private {!HTMLElement} */
    this.chaptersContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.chaptersContainer_.id = 'shaka-player-ui-chapters-container';
    this.container.appendChild(this.chaptersContainer_);

    this.setupChapters_();

    /**
     * When user is scrubbing the seek bar - we should pause the video - see
     * https://github.com/google/shaka-player/pull/2898#issuecomment-705229215
     * but will conditionally pause or play the video after scrubbing
     * depending on its previous state
     *
     * @private {boolean}
     */
    this.wasPlaying_ = false;


    /** @private {!HTMLElement} */
    this.thumbnailContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.thumbnailContainer_.id = 'shaka-player-ui-thumbnail-container';

    /** @private {!HTMLImageElement} */
    this.thumbnailImage_ = /** @type {!HTMLImageElement} */ (
      shaka.util.Dom.createHTMLElement('img'));
    this.thumbnailImage_.id = 'shaka-player-ui-thumbnail-image';
    this.thumbnailImage_.draggable = false;

    /** @private {!HTMLElement} */
    this.thumbnailTime_ = shaka.util.Dom.createHTMLElement('div');
    this.thumbnailTime_.id = 'shaka-player-ui-thumbnail-time';

    this.thumbnailContainer_.appendChild(this.thumbnailImage_);
    this.thumbnailContainer_.appendChild(this.thumbnailTime_);
    this.container.appendChild(this.thumbnailContainer_);

    /**
     * @private {?shaka.extern.Thumbnail}
     */
    this.lastThumbnail_ = null;

    /**
     * @private {?shaka.net.NetworkingEngine.PendingRequest}
     */
    this.lastThumbnailPendingRequest_ = null;

    /**
     * True if the bar is moving due to touchscreen or keyboard events.
     *
     * @private {boolean}
     */
    this.isMoving_ = false;

    /**
     * The timer is activated to hide the thumbnail.
     *
     * @private {shaka.util.Timer}
     */
    this.hideThumbnailTimer_ = new shaka.util.Timer(() => {
      this.hideThumbnail_();
    });

    /** @private {!Array.<!shaka.extern.AdCuePoint>} */
    this.adCuePoints_ = [];

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_UPDATED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_CHANGED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          if (!this.shouldBeDisplayed_()) {
            shaka.ui.Utils.setDisplay(this.container, false);
          }
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          if (this.shouldBeDisplayed_()) {
            shaka.ui.Utils.setDisplay(this.container, true);
          }
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.CUEPOINTS_CHANGED, (e) => {
          this.adCuePoints_ = (e)['cuepoints'];
          this.onAdCuePointsChanged_();
        });

    this.eventManager.listen(
        this.player, 'unloading', () => {
          this.adCuePoints_ = [];
          this.onAdCuePointsChanged_();
          if (this.lastThumbnailPendingRequest_) {
            this.lastThumbnailPendingRequest_.abort();
            this.lastThumbnailPendingRequest_ = null;
          }
          this.lastThumbnail_ = null;
          this.hideThumbnail_();
        });

    this.eventManager.listen(this.bar, 'mousemove', (event) => {
      if (!this.player.getImageTracks().length) {
        this.hideThumbnail_();
        return;
      }
      const rect = this.bar.getBoundingClientRect();
      const min = parseFloat(this.bar.min);
      const max = parseFloat(this.bar.max);
      // Pixels from the left of the range element
      const mousePosition = event.clientX - rect.left;
      // Pixels per unit value of the range element.
      const scale = (max - min) / rect.width;
      // Mouse position in units, which may be outside the allowed range.
      const value = Math.round(min + scale * mousePosition);
      // Show Thumbnail
      this.showThumbnail_(mousePosition, value);
    });

    this.eventManager.listen(this.container, 'mouseleave', () => {
      this.hideThumbnailTimer_.stop();
      this.hideThumbnailTimer_.tickAfter(/* seconds= */ 0.25);
    });

    // Initialize seek state and label.
    this.setValue(this.video.currentTime);
    this.update();
    this.updateAriaLabel_();

    if (this.ad) {
      // There was already an ad.
      shaka.ui.Utils.setDisplay(this.container, false);
    }
  }

  /** @override */
  release() {
    if (this.seekTimer_) {
      this.seekTimer_.stop();
      this.seekTimer_ = null;
      this.adBreaksTimer_.stop();
      this.adBreaksTimer_ = null;
    }

    this.chaptersEventManager_.release();

    super.release();
  }

  /**
   * Called by the base class when user interaction with the input element
   * begins.
   *
   * @override
   */
  onChangeStart() {
    this.wasPlaying_ = !this.video.paused;
    this.controls.setSeeking(true);
    this.video.pause();
    this.hideThumbnailTimer_.stop();
    this.isMoving_ = true;
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    if (!this.video.duration) {
      // Can't seek yet.  Ignore.
      return;
    }

    // Update the UI right away.
    this.update();

    // We want to wait until the user has stopped moving the seek bar for a
    // little bit to reduce the number of times we ask the player to seek.
    //
    // To do this, we will start a timer that will fire in a little bit, but if
    // we see another seek bar change, we will cancel that timer and re-start
    // it.
    //
    // Calling |start| on an already pending timer will cancel the old request
    // and start the new one.
    this.seekTimer_.tickAfter(/* seconds= */ 0.125);

    if (this.player.getImageTracks().length) {
      const min = parseFloat(this.bar.min);
      const max = parseFloat(this.bar.max);
      const rect = this.bar.getBoundingClientRect();
      const value = Math.round(this.getValue());
      const scale = (max - min) / rect.width;
      const position = (value - min) / scale;
      this.showThumbnail_(position, value);
    } else {
      this.hideThumbnail_();
    }
  }

  /**
   * Called by the base class when user interaction with the input element
   * ends.
   *
   * @override
   */
  onChangeEnd() {
    // They just let go of the seek bar, so cancel the timer and manually
    // call the event so that we can respond immediately.
    this.seekTimer_.tickNow();
    this.controls.setSeeking(false);

    if (this.wasPlaying_) {
      this.video.play();
    }

    if (this.isMoving_) {
      this.isMoving_ = false;
      this.hideThumbnailTimer_.stop();
      this.hideThumbnailTimer_.tickAfter(/* seconds= */ 0.25);
    }
  }

  /**
   * @override
  */
  isShowing() {
    // It is showing by default, so it is hidden if shaka-hidden is in the list.
    return !this.container.classList.contains('shaka-hidden');
  }

  /**
   * @override
   */
  update() {
    const colors = this.config_.seekBarColors;
    const currentTime = this.getValue();
    const bufferedLength = this.video.buffered.length;
    const bufferedStart = bufferedLength ? this.video.buffered.start(0) : 0;
    const bufferedEnd =
        bufferedLength ? this.video.buffered.end(bufferedLength - 1) : 0;

    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    this.setRange(seekRange.start, seekRange.end);

    if (!this.shouldBeDisplayed_()) {
      shaka.ui.Utils.setDisplay(this.container, false);
    } else {
      shaka.ui.Utils.setDisplay(this.container, true);

      if (bufferedLength == 0) {
        this.container.style.background = colors.base;
      } else {
        const clampedBufferStart = Math.max(bufferedStart, seekRange.start);
        const clampedBufferEnd = Math.min(bufferedEnd, seekRange.end);
        const clampedCurrentTime = Math.min(
            Math.max(currentTime, seekRange.start),
            seekRange.end);

        const bufferStartDistance = clampedBufferStart - seekRange.start;
        const bufferEndDistance = clampedBufferEnd - seekRange.start;
        const playheadDistance = clampedCurrentTime - seekRange.start;

        // NOTE: the fallback to zero eliminates NaN.
        const bufferStartFraction = (bufferStartDistance / seekRangeSize) || 0;
        const bufferEndFraction = (bufferEndDistance / seekRangeSize) || 0;
        const playheadFraction = (playheadDistance / seekRangeSize) || 0;

        const unbufferedColor =
            this.config_.showUnbufferedStart ? colors.base : colors.played;

        const gradient = [
          'to right',
          this.makeColor_(unbufferedColor, bufferStartFraction),
          this.makeColor_(colors.played, bufferStartFraction),
          this.makeColor_(colors.played, playheadFraction),
          this.makeColor_(colors.buffered, playheadFraction),
          this.makeColor_(colors.buffered, bufferEndFraction),
          this.makeColor_(colors.base, bufferEndFraction),
        ];
        this.container.style.background =
            'linear-gradient(' + gradient.join(',') + ')';
      }
    }
  }

  /**
   * @private
   */
  markAdBreaks_() {
    if (!this.adCuePoints_.length) {
      this.adMarkerContainer_.style.background = 'transparent';
      return;
    }

    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;
    const gradient = ['to right'];
    const pointsAsFractions = [];
    const adBreakColor = this.config_.seekBarColors.adBreaks;
    let postRollAd = false;
    for (const point of this.adCuePoints_) {
      // Post-roll ads are marked as starting at -1 in CS IMA ads.
      if (point.start == -1 && !point.end) {
        postRollAd = true;
      }
      // Filter point within the seek range. For points with no endpoint
      // (client side ads) check that the start point is within range.
      if (point.start >= seekRange.start && point.start < seekRange.end) {
        if (point.end && point.end > seekRange.end) {
          continue;
        }

        const startDist = point.start - seekRange.start;
        const startFrac = (startDist / seekRangeSize) || 0;
        // For points with no endpoint assume a 1% length: not too much,
        // but enough to be visible on the timeline.
        let endFrac = startFrac + 0.01;
        if (point.end) {
          const endDist = point.end - seekRange.start;
          endFrac = (endDist / seekRangeSize) || 0;
        }

        pointsAsFractions.push({
          start: startFrac,
          end: endFrac,
        });
      }
    }

    for (const point of pointsAsFractions) {
      gradient.push(this.makeColor_('transparent', point.start));
      gradient.push(this.makeColor_(adBreakColor, point.start));
      gradient.push(this.makeColor_(adBreakColor, point.end));
      gradient.push(this.makeColor_('transparent', point.end));
    }

    if (postRollAd) {
      gradient.push(this.makeColor_('transparent', 0.99));
      gradient.push(this.makeColor_(adBreakColor, 0.99));
    }
    this.adMarkerContainer_.style.background =
            'linear-gradient(' + gradient.join(',') + ')';
  }


  /**
   * @param {string} color
   * @param {number} fract
   * @return {string}
   * @private
   */
  makeColor_(color, fract) {
    return color + ' ' + (fract * 100) + '%';
  }


  /**
   * @private
   */
  onAdCuePointsChanged_() {
    this.markAdBreaks_();
    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;
    const minSeekBarWindow = shaka.ui.Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR;
    // Seek range keeps changing for live content and some of the known
    // ad breaks might not be in the seek range now, but get into
    // it later.
    // If we have a LIVE seekable content, keep checking for ad breaks
    // every second.
    if (this.player.isLive() && seekRangeSize > minSeekBarWindow) {
      this.adBreaksTimer_.tickEvery(1);
    }
  }


  /**
   * @return {boolean}
   * @private
   */
  shouldBeDisplayed_() {
    // The seek bar should be hidden when the seek window's too small or
    // there's an ad playing.
    const seekRange = this.player.seekRange();
    const seekRangeSize = seekRange.end - seekRange.start;

    if (this.player.isLive() &&
        seekRangeSize < shaka.ui.Constants.MIN_SEEK_WINDOW_TO_SHOW_SEEKBAR) {
      return false;
    }

    return this.ad == null || !this.ad.isLinear();
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.ariaLabel = this.localization.resolve(shaka.ui.Locales.Ids.SEEK);
  }


  /**
   * @private
   */
  async showThumbnail_(pixelPosition, value) {
    const thumbnailTrack = this.getThumbnailTrack_();
    if (!thumbnailTrack) {
      this.hideThumbnail_();
      return;
    }
    if (value < 0) {
      value = 0;
    }
    const seekRange = this.player.seekRange();
    const playerValue = Math.max(Math.ceil(seekRange.start),
        Math.min(Math.floor(seekRange.end), value));
    const thumbnail =
        await this.player.getThumbnails(thumbnailTrack.id, playerValue);
    if (!thumbnail || !thumbnail.uris.length) {
      this.hideThumbnail_();
      return;
    }
    if (this.player.isLive()) {
      const totalSeconds = seekRange.end - value;
      if (totalSeconds < 1) {
        this.thumbnailTime_.textContent =
            this.localization.resolve(shaka.ui.Locales.Ids.LIVE);
      } else {
        this.thumbnailTime_.textContent =
            '-' + this.timeFormatter_(totalSeconds);
      }
    } else {
      this.thumbnailTime_.textContent = this.timeFormatter_(value);
    }
    const offsetTop = -10;
    const width = this.thumbnailContainer_.clientWidth;
    let height = Math.floor(width * 9 / 16);
    this.thumbnailContainer_.style.height = height + 'px';
    this.thumbnailContainer_.style.top = -(height - offsetTop) + 'px';
    const leftPosition = Math.min(this.bar.offsetWidth - width,
        Math.max(0, pixelPosition - (width / 2)));
    this.thumbnailContainer_.style.left = leftPosition + 'px';
    this.thumbnailContainer_.style.visibility = 'visible';
    let uri = thumbnail.uris[0].split('#xywh=')[0];
    if (!this.lastThumbnail_ ||
        uri !== this.lastThumbnail_.uris[0].split('#xywh=')[0] ||
        thumbnail.segment.getStartByte() !=
            this.lastThumbnail_.segment.getStartByte() ||
        thumbnail.segment.getEndByte() !=
            this.lastThumbnail_.segment.getEndByte()) {
      this.lastThumbnail_ = thumbnail;
      if (this.lastThumbnailPendingRequest_) {
        this.lastThumbnailPendingRequest_.abort();
        this.lastThumbnailPendingRequest_ = null;
      }
      if (thumbnailTrack.codecs == 'mjpg' || uri.startsWith('offline:')) {
        this.thumbnailImage_.src = shaka.ui.SeekBar.Transparent_Image_;
        try {
          const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
          const type =
              shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;
          const request = shaka.util.Networking.createSegmentRequest(
              thumbnail.segment.getUris(),
              thumbnail.segment.getStartByte(),
              thumbnail.segment.getEndByte(),
              this.player.getConfiguration().streaming.retryParameters);
          this.lastThumbnailPendingRequest_ = this.player.getNetworkingEngine()
              .request(requestType, request, {type});
          const response = await this.lastThumbnailPendingRequest_.promise;
          this.lastThumbnailPendingRequest_ = null;
          if (thumbnailTrack.codecs == 'mjpg') {
            const parser = new shaka.util.Mp4Parser()
                .box('mdat', shaka.util.Mp4Parser.allData((data) => {
                  const blob = new Blob([data], {type: 'image/jpeg'});
                  uri = URL.createObjectURL(blob);
                }));
            parser.parse(response.data, /* partialOkay= */ false);
          } else {
            const mimeType = thumbnailTrack.mimeType || 'image/jpeg';
            const blob = new Blob([response.data], {type: mimeType});
            uri = URL.createObjectURL(blob);
          }
        } catch (error) {
          if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
            return;
          }
          throw error;
        }
      }
      try {
        this.thumbnailContainer_.removeChild(this.thumbnailImage_);
      } catch (e) {
        // The image is not a child
      }
      this.thumbnailImage_ = /** @type {!HTMLImageElement} */ (
        shaka.util.Dom.createHTMLElement('img'));
      this.thumbnailImage_.id = 'shaka-player-ui-thumbnail-image';
      this.thumbnailImage_.draggable = false;
      this.thumbnailImage_.src = uri;
      this.thumbnailImage_.onload = () => {
        if (uri.startsWith('blob:')) {
          URL.revokeObjectURL(uri);
        }
      };
      this.thumbnailContainer_.insertBefore(this.thumbnailImage_,
          this.thumbnailContainer_.firstChild);
    }
    const scale = width / thumbnail.width;
    if (thumbnail.imageHeight) {
      this.thumbnailImage_.height = thumbnail.imageHeight;
    } else if (!thumbnail.sprite) {
      this.thumbnailImage_.style.height = '100%';
      this.thumbnailImage_.style.objectFit = 'contain';
    }
    if (thumbnail.imageWidth) {
      this.thumbnailImage_.width = thumbnail.imageWidth;
    } else if (!thumbnail.sprite) {
      this.thumbnailImage_.style.width = '100%';
      this.thumbnailImage_.style.objectFit = 'contain';
    }
    this.thumbnailImage_.style.left = '-' + scale * thumbnail.positionX + 'px';
    this.thumbnailImage_.style.top = '-' + scale * thumbnail.positionY + 'px';
    this.thumbnailImage_.style.transform = 'scale(' + scale + ')';
    this.thumbnailImage_.style.transformOrigin = 'left top';
    // Update container height and top
    height = Math.floor(width * thumbnail.height / thumbnail.width);
    this.thumbnailContainer_.style.height = height + 'px';
    this.thumbnailContainer_.style.top = -(height - offsetTop) + 'px';
  }


  /**
   * @return {?shaka.extern.Track} The thumbnail track.
   * @private
   */
  getThumbnailTrack_() {
    const imageTracks = this.player.getImageTracks();
    if (!imageTracks.length) {
      return null;
    }
    const mimeTypesPreference = [
      'image/avif',
      'image/webp',
      'image/jpeg',
      'image/png',
      'image/svg+xml',
    ];
    for (const mimeType of mimeTypesPreference) {
      const estimatedBandwidth = this.player.getStats().estimatedBandwidth;
      const bestOptions = imageTracks.filter((track) => {
        return track.mimeType.toLowerCase() === mimeType &&
            track.bandwidth < estimatedBandwidth * 0.01;
      }).sort((a, b) => {
        return b.bandwidth - a.bandwidth;
      });
      if (bestOptions && bestOptions.length) {
        return bestOptions[0];
      }
    }
    const mjpgTrack = imageTracks.find((track) => {
      return track.mimeType == 'application/mp4' && track.codecs == 'mjpg';
    });
    return mjpgTrack || imageTracks[0];
  }


  /**
   * @private
   */
  hideThumbnail_() {
    this.thumbnailContainer_.style.visibility = 'hidden';
    this.thumbnailTime_.textContent = '';
  }


  /**
   * @param {number} totalSeconds
   * @private
   */
  timeFormatter_(totalSeconds) {
    const secondsNumber = Math.round(totalSeconds);
    const hours = Math.floor(secondsNumber / 3600);
    let minutes = Math.floor((secondsNumber - (hours * 3600)) / 60);
    let seconds = secondsNumber - (hours * 3600) - (minutes * 60);
    if (seconds < 10) {
      seconds = '0' + seconds;
    }
    if (hours > 0) {
      if (minutes < 10) {
        minutes = '0' + minutes;
      }
      return hours + ':' + minutes + ':' + seconds;
    } else {
      return minutes + ':' + seconds;
    }
  }

  /**
   * Sets up the chapter element creator and change handling.
   * @private
   */
  setupChapters_() {
    let language = 'und';
    /** @type {!Array<shaka.extern.Chapter>} */
    let chapters = [];

    /**
    * Does a value compare on chapters.
    * @param {shaka.extern.Chapter} a
    * @param {shaka.extern.Chapter} b
    * @return {boolean}
    */
    const chaptersEqual = (a, b) => {
      return (!a && !b) || (a.id === b.id && a.title === b.title &&
          a.startTime === b.startTime && a.endTime === b.endTime);
    };

    /** @type {function(): void} */
    const handleChapterTrackChange = () => {
      let nextLanguage = 'und';
      /** @type {!Array<shaka.extern.Chapter>} */
      let nextChapters = [];

      const currentLocales = this.localization.getCurrentLocales();
      for (const locale of Array.from(currentLocales)) {
        nextLanguage = locale;
        nextChapters = this.player.getChapters(nextLanguage);
        if (nextChapters.length) {
          break;
        }
      }
      if (!nextChapters.length) {
        nextLanguage = 'und';
        nextChapters = this.player.getChapters(nextLanguage);
      }

      const languageChanged = nextLanguage !== language;
      const chaptersChanged = chapters.length !== nextChapters.length ||
        !chapters.some((c, idx) => {
          const n = nextChapters.at(idx);
          return chaptersEqual(c, n) ||
            nextChapters.some((n) => chaptersEqual(c, n));
        });

      language = nextLanguage;
      chapters = nextChapters;
      if (!nextChapters.length) {
        this.deletePreviousChapters_();
      } else if (languageChanged || chaptersChanged) {
        this.createChapterElements_(this.container, chapters);
      }
    };

    handleChapterTrackChange();

    this.eventManager.listen(
        this.player, 'unloading', () => {
          this.deletePreviousChapters_();
          language = 'und';
          chapters = [];
        });

    this.eventManager.listen(
        this.player, 'trackschanged', handleChapterTrackChange);

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          handleChapterTrackChange();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          handleChapterTrackChange();
        });
  }

  /**
   * Builds and inserts ChaptersElement into dom container.
   * @param {!HTMLElement} container
   * @param {!Array<shaka.extern.Chapter>} chapterTracks
   * @private
   */
  createChapterElements_(container, chapterTracks) {
    this.deletePreviousChapters_();

    const hiddenClass = 'shaka-hidden';

    /** @type {{start: number, end: number}} */
    const seekRange = this.player.seekRange();

    /**
     * @type {!Array<{
     *  start: number,
     *  end: number,
     *  size: number,
     *  title: string,
     *  id: string
     * }>}
     * */
    const chapters = [];

    for (const c of chapterTracks) {
      if (c.startTime >= seekRange.end) {
        continue;
      }
      const start = c.startTime > seekRange.start ?
        c.startTime : seekRange.start;
      const end = c.endTime < seekRange.end ?
        c.endTime : seekRange.end;
      const size = (end-start);
      chapters.push({start, end, size, title: c.title, id: c.id});
    }

    if (chapters.length < 2) {
      return;
    }

    const totalSize = chapters.reduce((t, c) => {
      t += c.size;
      return t;
    }, 0);

    /**
     * @type {!Array<{
     *  start: number,
     *  end: number,
     *  el: HTMLElement
     * }>}
     * */
    const chapterElMap = [];

    for (const c of chapters) {
      /** @type {!HTMLElement} */
      const chapterEl = shaka.util.Dom.createHTMLElement('div');
      chapterEl.classList.add('shaka-chapter');
      chapterEl.style.width = `${c.size * 100 / totalSize}%`;

      this.chaptersContainer_.appendChild(chapterEl);

      /** @type {!HTMLElement} */
      const chapterMarker = shaka.util.Dom.createHTMLElement('div');
      chapterMarker.style.borderColor =
        this.config_.seekBarColors.chapterMarks;
      chapterEl.appendChild(chapterMarker);

      /** @type {!HTMLElement} */
      const chapterLabel = shaka.util.Dom.createHTMLElement('p');
      chapterLabel.classList.add('shaka-chapter-label', hiddenClass);
      chapterLabel.style.color =
        this.config_.seekBarColors.chapterLabels;
      chapterLabel.innerText = c.title;
      chapterEl.appendChild(chapterLabel);

      chapterElMap.push(
          {start: c.start, end: c.end, el: chapterLabel});
    }

    // Add chapter event listeners
    this.chaptersEventManager_.listen(this.bar, 'pointermove', (e) => {
      if (!e.target) {
        return;
      }
      const target = /** @type {HTMLElement} */(e.target);

      const screenXDiff = e.offsetX / target.clientWidth;
      const rangeMax = parseInt(target.getAttribute('max'), 10);
      const hoverVal = screenXDiff * rangeMax;

      for (const c of chapterElMap) {
        const hidden = c.el.classList.contains(hiddenClass);
        const inChapter = c.start <= hoverVal && hoverVal < c.end;
        if (inChapter === hidden) {
          c.el.classList.toggle(hiddenClass);
        }
      }
    }, {passive: true});

    this.chaptersEventManager_.listen(this.bar, 'pointerout', () => {
      for (const c of chapterElMap) {
        if (!c.el.classList.contains(hiddenClass)) {
          c.el.classList.add(hiddenClass);
        }
      }
    }, {passive: true});
  }

  /**
   * @private
   */
  deletePreviousChapters_() {
    this.chaptersEventManager_.removeAll();
    shaka.util.Dom.removeAllChildren(this.chaptersContainer_);
  }
};


/**
 * @const {string}
 * @private
 */
shaka.ui.SeekBar.Transparent_Image_ =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';


/**
 * @implements {shaka.extern.IUISeekBar.Factory}
 * @export
 */

shaka.ui.SeekBar.Factory = class {
  /**
   * Creates a shaka.ui.SeekBar. Use this factory to register the default
   * SeekBar when needed
   *
   * @override
   */
  create(rootElement, controls) {
    return new shaka.ui.SeekBar(rootElement, controls);
  }
};
