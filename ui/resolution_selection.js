/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ResolutionSelection');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Overlay.TrackLabelFormat');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.MimeUtils');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.ResolutionSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons.RESOLUTION);

    this.button.classList.add('shaka-resolution-button');
    this.button.classList.add('shaka-tooltip-status');
    this.menu.classList.add('shaka-resolutions');

    this.autoQuality = shaka.util.Dom.createHTMLElement('span');
    this.autoQuality.classList.add('shaka-current-auto-quality');
    this.autoQuality.style.display = 'none';

    this.qualityMark = shaka.util.Dom.createHTMLElement('sup');
    this.qualityMark.classList.add('shaka-current-quality-mark');
    this.qualityMark.style.display = 'none';

    if (!Array.from(parent.classList).includes('shaka-overflow-menu')) {
      this.overflowQualityMark = shaka.util.Dom.createHTMLElement('span');
      this.overflowQualityMark.classList.add(
          'shaka-overflow-playback-rate-mark');
      this.button.appendChild(this.overflowQualityMark);
    } else if (this.parent.parentElement) {
      const parentElement =
          shaka.util.Dom.asHTMLElement(this.parent.parentElement);
      this.overflowQualityMark = shaka.util.Dom.getElementByClassNameIfItExists(
          'shaka-overflow-quality-mark', parentElement);
    }

    const spanWrapper = shaka.util.Dom.createHTMLElement('span');
    this.button.childNodes[1].appendChild(spanWrapper);
    spanWrapper.appendChild(this.currentSelection);
    spanWrapper.appendChild(this.autoQuality);
    spanWrapper.appendChild(this.qualityMark);

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });


    this.eventManager.listen(this.player, 'loading', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'variantchanged', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'abrstatuschanged', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.eventManager.listen(this.player, 'adaptation', () => {
      this.updateSelection_();
      this.updateLabels_();
    });

    this.updateSelection_();
  }

  /** @private */
  updateLabels_() {
    const abrEnabled = this.player.getConfiguration().abr.enabled;
    if (this.player.isAudioOnly()) {
      this.qualityMark.textContent = '';
      this.qualityMark.style.display = 'none';
      if (this.overflowQualityMark) {
        this.overflowQualityMark.textContent = '';
        this.overflowQualityMark.style.display = 'none';
      }
      const audioTracks = this.player.getVariantTracks() || [];
      const audioTrack = audioTracks.find((track) => track.active);
      if (!audioTrack) {
        return;
      }
      if (abrEnabled) {
        if (audioTrack.bandwidth) {
          this.autoQuality.textContent =
              this.getQualityLabel_(audioTrack, audioTracks);
        } else {
          this.autoQuality.textContent = 'Unknown';
        }
        this.autoQuality.style.display = '';
      } else {
        this.autoQuality.style.display = 'none';
      }
      return;
    }
    const tracks = this.player.getVideoTracks() || [];
    const track = tracks.find((track) => track.active);
    if (!track) {
      if (this.overflowQualityMark) {
        const stats = this.player.getStats();
        const mark = this.getQualityMark_(stats.width, stats.height);
        this.overflowQualityMark.textContent = mark;
        this.overflowQualityMark.style.display = mark !== '' ? '' : 'none';
      }
      return;
    }
    if (abrEnabled) {
      if (track.height && track.width) {
        this.autoQuality.textContent = this.getResolutionLabel_(track, tracks);
      } else if (track.bandwidth) {
        this.autoQuality.textContent =
            this.getTextFromBandwidth_(track.bandwidth);
      } else {
        this.autoQuality.textContent = 'Unknown';
      }
      this.autoQuality.style.display = '';
    } else {
      this.autoQuality.style.display = 'none';
    }

    /** @type {string} */
    const mark = this.getQualityMark_(track.width, track.height);
    this.qualityMark.textContent = mark;
    this.qualityMark.style.display = mark !== '' ? '' : 'none';
    if (this.overflowQualityMark) {
      this.overflowQualityMark.textContent = mark;
      this.overflowQualityMark.style.display = mark !== '' ? '' : 'none';
    }
  }

  /**
   * @param {?number} width
   * @param {?number} height
   * @return {string}
   * @private
   */
  getQualityMark_(width, height) {
    if (!width || !height) {
      return '';
    }
    let trackHeight = height;
    let trackWidth = width;
    if (trackHeight > trackWidth) {
      // Vertical video.
      [trackWidth, trackHeight] = [trackHeight, trackWidth];
    }
    const aspectRatio = trackWidth / trackHeight;
    if (aspectRatio > (16 / 9)) {
      trackHeight = Math.round(trackWidth * 9 / 16);
    }
    const qualityMarks = this.controls.getConfig().qualityMarks;
    if (trackHeight >= 8640) {
      return trackHeight + 'p';
    } else if (trackHeight >= 4320) {
      return qualityMarks['4320'];
    } else if (trackHeight >= 2160) {
      return qualityMarks['2160'];
    } else if (trackHeight >= 1440) {
      return qualityMarks['1440'];
    } else if (trackHeight >= 1080) {
      return qualityMarks['1080'];
    } else if (trackHeight >= 720) {
      return qualityMarks['720'];
    }
    return '';
  }

  /** @private */
  updateSelection_() {
    // Remove old shaka-resolutions
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    // Add new ones
    let numberOfTracks = 0;
    if (this.player.isAudioOnly()) {
      numberOfTracks = this.updateAudioOnlySelection_();
    } else {
      numberOfTracks = this.updateResolutionSelection_();
    }

    // Add the Auto button
    const autoButton = shaka.util.Dom.createButton();
    autoButton.classList.add('shaka-enable-abr-button');
    this.eventManager.listen(autoButton, 'click', () => {
      const config = {abr: {enabled: true}};
      this.player.configure(config);
      this.updateSelection_();
    });

    /** @private {!HTMLElement}*/
    this.abrOnSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.abrOnSpan_.textContent =
        this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    autoButton.appendChild(this.abrOnSpan_);

    // If abr is enabled reflect it by marking 'Auto' as selected.
    if (this.player.getConfiguration().abr.enabled) {
      autoButton.ariaSelected = 'true';
      autoButton.appendChild(shaka.ui.Utils.checkmarkIcon());

      this.abrOnSpan_.classList.add('shaka-chosen-item');

      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }

    this.button.setAttribute('shaka-status', this.currentSelection.textContent);

    this.menu.appendChild(autoButton);
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    this.controls.dispatchEvent(
        new shaka.util.FakeEvent('resolutionselectionupdated'));

    this.updateLocalizedStrings_();

    shaka.ui.Utils.setDisplay(this.button, numberOfTracks > 0);
  }

  /**
   * @return {number}
   * @private
   */
  updateAudioOnlySelection_() {
    const TrackLabelFormat = shaka.ui.Overlay.TrackLabelFormat;
    /** @type {!Array<shaka.extern.Track>} */
    let tracks = [];
    // When played with src=, the variant tracks available from
    // player.getVariantTracks() represent languages, not resolutions.
    if (this.player.getLoadMode() != shaka.Player.LoadMode.SRC_EQUALS &&
        !this.player.isRemotePlayback()) {
      tracks = this.player.getVariantTracks() || [];
    }

    // If there is a selected variant track, then we filter out any tracks in
    // a different language.  Then we use those remaining tracks to display the
    // available resolutions.
    const selectedTrack = tracks.find((track) => track.active);
    if (selectedTrack) {
      tracks = tracks.filter((track) => {
        if (track.language != selectedTrack.language) {
          return false;
        }
        if (this.controls.getConfig().showAudioChannelCountVariants &&
            track.channelsCount && selectedTrack.channelsCount &&
            track.channelsCount != selectedTrack.channelsCount) {
          return false;
        }
        const trackLabelFormat = this.controls.getConfig().trackLabelFormat;
        if ((trackLabelFormat == TrackLabelFormat.ROLE ||
            trackLabelFormat == TrackLabelFormat.LANGUAGE_ROLE)) {
          if (JSON.stringify(track.audioRoles) !=
              JSON.stringify(selectedTrack.audioRoles)) {
            return false;
          }
        }
        if (trackLabelFormat == TrackLabelFormat.LABEL &&
            track.label != selectedTrack.label) {
          return false;
        }
        if (!track.bandwidth) {
          return false;
        }
        return true;
      });
    }

    // Remove duplicate entries with the same quality.
    tracks = tracks.filter((track, idx) => {
      return tracks.findIndex((t) => t.bandwidth == track.bandwidth) == idx;
    });

    // Sort the tracks by bandwidth.
    tracks.sort((t1, t2) => {
      goog.asserts.assert(t1.bandwidth != null, 'Null bandwidth');
      goog.asserts.assert(t2.bandwidth != null, 'Null bandwidth');
      return t2.bandwidth - t1.bandwidth;
    });

    const abrEnabled = this.player.getConfiguration().abr.enabled;

    // Add new ones
    for (const track of tracks) {
      const button = shaka.util.Dom.createButton();
      button.classList.add('explicit-resolution');
      this.eventManager.listen(button, 'click',
          () => this.onTrackSelected_(track));

      const span = shaka.util.Dom.createHTMLElement('span');
      if (track.bandwidth) {
        span.textContent = this.getQualityLabel_(track, tracks);
      } else {
        span.textContent = 'Unknown';
      }
      button.appendChild(span);

      if (!abrEnabled && track == selectedTrack) {
        // If abr is disabled, mark the selected track's resolution.
        button.ariaSelected = 'true';
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        this.currentSelection.textContent = span.textContent;
      }
      this.menu.appendChild(button);
    }

    return tracks.length;
  }


  /**
   * @return {number}
   * @private
   */
  updateResolutionSelection_() {
    /** @type {!Array<shaka.extern.VideoTrack>} */
    let tracks = this.player.getVideoTracks() || [];

    const selectedTrack = tracks.find((track) => track.active);

    tracks = tracks.filter((track, idx) => {
      // Keep the first one with the same height and framerate or bandwidth.
      const otherIdx = tracks.findIndex((t) => {
        let ret = t.height == track.height &&
            t.bandwidth == track.bandwidth &&
            t.frameRate == track.frameRate &&
            t.hdr == track.hdr &&
            t.videoLayout == track.videoLayout &&
            shaka.util.ArrayUtils.equal(t.roles, track.roles);
        if (ret && this.controls.getConfig().showVideoCodec &&
            t.codecs && track.codecs) {
          ret = shaka.util.MimeUtils.getNormalizedCodec(t.codecs) ==
              shaka.util.MimeUtils.getNormalizedCodec(track.codecs);
        }
        return ret;
      });
      return otherIdx == idx;
    });

    // Sort the tracks by height or bandwidth depending on content type.
    tracks.sort((t1, t2) => {
      if (t2.height == t1.height || t1.height == null || t2.height == null) {
        return t2.bandwidth - t1.bandwidth;
      }
      return t2.height - t1.height;
    });

    const abrEnabled = this.player.getConfiguration().abr.enabled;

    // Add new ones
    for (const track of tracks) {
      const button = shaka.util.Dom.createButton();
      button.classList.add('explicit-resolution');
      this.eventManager.listen(button, 'click',
          () => this.onVideoTrackSelected_(track));

      const span = shaka.util.Dom.createHTMLElement('span');
      if (track.height && track.width) {
        span.textContent = this.getResolutionLabel_(track, tracks);
      } else if (track.bandwidth) {
        span.textContent = this.getTextFromBandwidth_(track.bandwidth);
      } else {
        span.textContent = 'Unknown';
      }
      button.appendChild(span);

      const mark = this.getQualityMark_(track.width, track.height);
      if (mark !== '') {
        const markEl = shaka.util.Dom.createHTMLElement('sup');
        markEl.classList.add('shaka-quality-mark');
        markEl.textContent = mark;
        button.appendChild(markEl);
      }

      if (!abrEnabled && track == selectedTrack) {
        // If abr is disabled, mark the selected track's resolution.
        button.ariaSelected = 'true';
        button.appendChild(shaka.ui.Utils.checkmarkIcon());
        span.classList.add('shaka-chosen-item');
        this.currentSelection.textContent = span.textContent;
      }
      this.menu.appendChild(button);
    }

    return tracks.length;
  }


  /**
   * @param {!shaka.extern.VideoTrack} track
   * @param {!Array<!shaka.extern.VideoTrack>} tracks
   * @return {string}
   * @private
   */
  getResolutionLabel_(track, tracks) {
    let trackHeight = track.height || 0;
    let trackWidth = track.width || 0;
    if (trackHeight > trackWidth) {
      // Vertical video.
      [trackWidth, trackHeight] = [trackHeight, trackWidth];
    }
    let height = trackHeight;
    const aspectRatio = trackWidth / trackHeight;
    if (aspectRatio > (16 / 9)) {
      height = Math.round(trackWidth * 9 / 16);
    }
    let text = height + 'p';
    const frameRates = new Set();
    for (const item of tracks) {
      if (item.frameRate) {
        frameRates.add(Math.round(item.frameRate));
      }
    }
    if (frameRates.size > 1) {
      const frameRate = track.frameRate;
      if (frameRate && (frameRate >= 50 || frameRate <= 20)) {
        text += Math.round(track.frameRate);
      }
    }
    const isDolbyVision = (t) => {
      if (!t.codecs) {
        return false;
      }
      const codec = shaka.util.MimeUtils.getNormalizedCodec(t.codecs);
      return codec.startsWith('dovi-');
    };
    if (track.hdr == 'PQ' || track.hdr == 'HLG') {
      if (isDolbyVision(track)) {
        text += ' Dolby Vision';
      } else {
        text += ' HDR';
      }
    }
    const videoLayout = track.videoLayout || '';
    if (videoLayout.includes('CH-STEREO')) {
      text += ' 3D';
    }
    const basicResolutionComparison = (firstTrack, secondTrack) => {
      return firstTrack != secondTrack &&
          firstTrack.height == secondTrack.height &&
          firstTrack.hdr == secondTrack.hdr &&
          isDolbyVision(firstTrack) == isDolbyVision(secondTrack) &&
          Math.round(firstTrack.frameRate || 0) ==
          Math.round(secondTrack.frameRate || 0);
    };
    const hasDuplicateResolution = tracks.some((otherTrack) => {
      return basicResolutionComparison(track, otherTrack);
    });
    if (hasDuplicateResolution) {
      const hasDuplicateBandwidth = tracks.some((otherTrack) => {
        return basicResolutionComparison(track, otherTrack) &&
            otherTrack.bandwidth == track.bandwidth;
      });
      if (!hasDuplicateBandwidth) {
        text += ' (' + this.getTextFromBandwidth_(track.bandwidth) + ')';
      }

      if (this.controls.getConfig().showVideoCodec) {
        const getVideoCodecName = (codecs) => {
          let name = '';
          if (codecs) {
            const codec = shaka.util.MimeUtils.getNormalizedCodec(codecs);
            name = codec.toUpperCase();
          }
          return name ? ' ' + name : name;
        };
        const hasDuplicateCodec = tracks.some((otherTrack) => {
          return basicResolutionComparison(track, otherTrack) &&
              getVideoCodecName(otherTrack.codecs) !=
              getVideoCodecName(track.codecs);
        });
        if (hasDuplicateCodec) {
          text += getVideoCodecName(track.codecs);
        }
      }
    }
    return text;
  }


  /**
   * @param {!shaka.extern.Track} track
   * @param {!Array<!shaka.extern.Track>} tracks
   * @return {string}
   * @private
   */
  getQualityLabel_(track, tracks) {
    let text = this.getTextFromBandwidth_(track.bandwidth);
    if (this.controls.getConfig().showAudioCodec) {
      const getCodecName = (codecs) => {
        let name = '';
        if (codecs) {
          const codec = shaka.util.MimeUtils.getNormalizedCodec(codecs);
          name = codec.toUpperCase();
        }
        return name ? ' ' + name : name;
      };
      const hasDuplicateCodec = tracks.some((otherTrack) => {
        return getCodecName(otherTrack.codecs) != getCodecName(track.codecs);
      });
      if (hasDuplicateCodec) {
        text += getCodecName(track.codecs);
      }
    }
    return text;
  }


  /**
   * @param {number} bandwidth
   * @return {string}
   * @private
   */
  getTextFromBandwidth_(bandwidth) {
    if (bandwidth >= 1e6) {
      return (bandwidth / 1e6).toFixed(1).replace('.0', '') + ' Mbps';
    } else {
      return Math.floor(bandwidth / 1e3) + ' Kbps';
    }
  }


  /**
   * @param {!shaka.extern.VideoTrack} track
   * @private
   */
  onVideoTrackSelected_(track) {
    // Disable abr manager before changing tracks.
    const config = {abr: {enabled: false}};
    this.player.configure(config);
    const clearBuffer = this.controls.getConfig().clearBufferOnQualityChange;
    this.player.selectVideoTrack(track, clearBuffer);
  }


  /**
   * @param {!shaka.extern.Track} track
   * @private
   */
  onTrackSelected_(track) {
    // Disable abr manager before changing tracks.
    const config = {abr: {enabled: false}};
    this.player.configure(config);
    const clearBuffer = this.controls.getConfig().clearBufferOnQualityChange;
    this.player.selectVariantTrack(track, clearBuffer);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;
    const locId = this.player.isAudioOnly() ?
        LocIds.QUALITY : LocIds.RESOLUTION;

    this.button.ariaLabel = this.localization.resolve(locId);
    this.backButton.ariaLabel = this.localization.resolve(locId);
    this.backSpan.textContent =
        this.localization.resolve(locId);
    this.nameSpan.textContent =
        this.localization.resolve(locId);
    this.abrOnSpan_.textContent =
        this.localization.resolve(LocIds.AUTO_QUALITY);

    if (this.player.getConfiguration().abr.enabled) {
      this.currentSelection.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.AUTO_QUALITY);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ResolutionSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ResolutionSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'quality', new shaka.ui.ResolutionSelection.Factory());

shaka.ui.Controls.registerElement(
    'quality', new shaka.ui.ResolutionSelection.Factory());
