/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ChapterSelection');

goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.ChapterSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons['CHAPTER']);

    this.button.classList.add('shaka-chapter-button');
    this.menu.classList.add('shaka-chapters');
    this.button.classList.add('shaka-tooltip-status');

    this.eventManager.listenMulti(
        this.localization,
        [
          shaka.ui.Localization.LOCALE_UPDATED,
          shaka.ui.Localization.LOCALE_CHANGED,
        ], () => {
          this.updateLocalizedStrings_();
          this.updateChapters_();
        });

    let hasImageTracks = this.player.getImageTracks().length;

    this.eventManager.listen(this.controls, 'chaptersupdated', () => {
      this.updateChapters_();
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      const newHasImageTracks = this.player.getImageTracks().length;
      if (!hasImageTracks && newHasImageTracks) {
        const hasChaptersImages =
            this.controls.getChapters().some((c) => c.images.length > 0);
        if (!hasChaptersImages) {
          this.updateChapters_();
        }
      }
      hasImageTracks = newHasImageTracks;
    });

    if (this.isSubMenu) {
      this.eventManager.listenMulti(
          this.controls,
          [
            'submenuopen',
            'submenuclose',
          ], () => {
            const hasChapters = this.controls.getChapters().length > 0;
            shaka.ui.Utils.setDisplay(this.button,
                hasChapters && !this.isSubMenuOpened);
          });
    }

    // Set up all the strings in the user's preferred language.
    this.updateLocalizedStrings_();

    this.updateChapters_();
  }

  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.CHAPTERS);
    this.nameSpan.textContent = this.localization.resolve(LocIds.CHAPTERS);
    this.backSpan.textContent = this.localization.resolve(LocIds.CHAPTERS);
  }

  /**
   * @private
   */
  updateChapters_() {
    // 1. Save the back to menu button
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');

    // 2. Remove everything
    shaka.util.Dom.removeAllChildren(this.menu);

    // 3. Add the backTo Menu button back
    this.menu.appendChild(backButton);

    const chapters = this.controls.getChapters();
    if (chapters.length) {
      for (const chapter of chapters) {
        const button = shaka.util.Dom.createButton();
        button.classList.add('shaka-chapter-item');
        const span = shaka.util.Dom.createHTMLElement('span');
        span.classList.add('shaka-chapter');
        span.textContent = chapter.title;
        button.appendChild(span);

        this.loadThumbnailForChapter_(chapter)
            .then((img) => {
              if (img && this.menu.contains(button)) {
                img.alt = chapter.title;
                img.draggable = false;
                const container = shaka.util.Dom.createHTMLElement('div');
                container.classList.add('shaka-chapter-thumbnail');
                container.appendChild(img);
                button.insertBefore(container, span);
              }
            });

        this.eventManager.listen(button, 'click', () => {
          if (!this.controls.isOpaque()) {
            return;
          }
          this.video.currentTime = chapter.startTime;
        });

        this.menu.appendChild(button);
      }
      shaka.ui.Utils.setDisplay(this.button, !this.isSubMenuOpened);
    } else {
      shaka.ui.Utils.setDisplay(this.button, false);
    }
  }

  /**
   * @param {!shaka.extern.Chapter} chapter
   * @return {!Promise<?HTMLImageElement>}
   * @private
   */
  async loadThumbnailForChapter_(chapter) {
    if (chapter.images.length) {
      return this.loadChapterThumbnail_(chapter.images);
    }
    try {
      if (!this.player.getImageTracks().length) {
        return null;
      }
      const thumbnail = await this.player.getThumbnails(
          /* trackId= */ null, chapter.startTime);
      if (!thumbnail) {
        return null;
      }
      return this.loadThumbnailFromTrack_(thumbnail);
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {!Array<shaka.extern.ImageInfo>} images
   * @return {!Promise<?HTMLImageElement>}
   * @private
   */
  loadChapterThumbnail_(images) {
    return new Promise((resolve) => {
      let index = 0;
      const tryNext = () => {
        if (index >= images.length) {
          resolve();
          return;
        }

        const img = new Image();
        img.onload = () => {
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          resolve(img);
        };
        img.onerror = () => {
          index++;
          tryNext();
        };
        img.src = images[index].url;
      };
      tryNext();
    });
  }

  /**
   * @param {!shaka.extern.Thumbnail} thumbnail
   * @return {!Promise<?HTMLImageElement>}
   * @private
   */
  async loadThumbnailFromTrack_(thumbnail) {
    let uri = thumbnail.uris[0].split('#xywh=')[0];
    if (thumbnail.codecs == 'mjpg' || uri.startsWith('offline:')) {
      try {
        const requestType =
          shaka.net.NetworkingEngine.RequestType.SEGMENT;

        const type =
          shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;

        const request = shaka.net.NetworkingUtils.createSegmentRequest(
            thumbnail.uris,
            thumbnail.startByte,
            thumbnail.endByte,
            this.player.getConfiguration().streaming.retryParameters);

        const response = await this.player.getNetworkingEngine()
            .request(requestType, request, {type}).promise;
        uri = shaka.ui.Utils.getUriFromThumbnailResponse(thumbnail, response);
      } catch (error) {
        if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
          return null;
        }
        throw error;
      }
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (!thumbnail.sprite) {
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
        } else {
          const scale = 60 / thumbnail.width;

          img.style.position = 'absolute';
          img.style.left = '-' + scale * thumbnail.positionX + 'px';
          img.style.top = '-' + scale * thumbnail.positionY + 'px';
          img.style.transform = 'scale(' + scale + ')';
          img.style.transformOrigin = 'left top';
        }
        resolve(img);
      };

      img.onerror = () => {
        resolve();
      };

      img.src = uri;
    });
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ChapterSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ChapterSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'chapter', new shaka.ui.ChapterSelection.Factory());

shaka.ui.Controls.registerElement(
    'chapter', new shaka.ui.ChapterSelection.Factory());
