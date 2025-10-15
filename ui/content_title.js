/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ContentTitle');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.TXml');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.ContentTitle = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @type {!HTMLElement} */
    this.title_ = shaka.util.Dom.createHTMLElement('div');
    this.title_.classList.add('shaka-content-title');
    this.parent.appendChild(this.title_);

    this.eventManager.listen(this.player, 'unloading', () => {
      this.title_.textContent = '';
      shaka.ui.Utils.setDisplay(this.title_, false);
    });

    this.eventManager.listen(this.player, 'loading', () => {
      this.title_.textContent = this.video.title || '';
      shaka.ui.Utils.setDisplay(this.title_, true);
    });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STARTED, () => {
          shaka.ui.Utils.setDisplay(this.title_, !this.ad.isLinear());
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STOPPED, () => {
          shaka.ui.Utils.setDisplay(this.title_, true);
        });

    this.eventManager.listen(this.player, 'metadata', (event) => {
      const payload = event['payload'];
      if (!payload) {
        return;
      }
      let title;
      if (payload['key'] == 'TIT2' && payload['data']) {
        title = payload['data'];
      }
      if (title) {
        this.title_.textContent = title;
      }
    });

    this.eventManager.listen(this.player, 'sessiondata', (event) => {
      if (event['id'] != 'com.apple.hls.title') {
        return;
      }
      const title = event['value'];
      if (title) {
        this.title_.textContent = title;
      }
    });

    this.eventManager.listen(this.player, 'programinformation', (event) => {
      if (!event['detail']) {
        return;
      }
      const TXml = shaka.util.TXml;
      /** @type {!shaka.extern.xml.Node} */
      const detail = /** @type {!shaka.extern.xml.Node} */(event['detail']);
      const titleNode = TXml.findChild(detail, 'Title');
      if (titleNode) {
        const title = TXml.getContents(titleNode);
        if (title) {
          this.title_.textContent = title;
        }
      }
    });
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ContentTitle.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ContentTitle(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'content_title', new shaka.ui.ContentTitle.Factory());
