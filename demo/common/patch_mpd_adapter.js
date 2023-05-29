/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shakaDemo.MPDPatchAdapter');

const PatchType = {
  ADD: 'add',
  REPLACE: 'replace',
  DELETE: 'delete',
};

const ParserMode = {
  INITIAL_FULL_MPD: 'INITIAL_FULL_MPD',
  PATCH_MPD: 'PATCH_MPD',
};

/**
 * @typedef {{
 *    type: string,
 *    xpathLocation: string,
 *    element: Node
 * }}
 */
shakaDemo.MPDPatchAdapter.Patch;

/**
 * Finds child XML elements.
 * @param {Node} elem The parent XML element.
 * @param {string} name The child XML element's tag name.
 * @return {!Array.<!Element>} The child XML elements.
 */
function findChildren(elem, name) {
  const found = [];
  if (!elem) {
    return [];
  }
  for (const child of elem.childNodes) {
    if (child instanceof Element && child.tagName == name) {
      found.push(child);
    }
  }
  return found;
}

shakaDemo.MPDPatchAdapter = class {
  /**
   * @param {string} url
   */
  constructor(url) {
    /** @type {string} */
    this.manifestUrl_ = url;
    /** @type {Set<string>} */
    this.periodContext_ = new Set();
    /** @type {Map<string, number>} */
    this.segmentContext_ = new Map();
    /** @type {string|undefined} */
    this.manifestType_ = undefined;
    /** @type {?string} */
    this.mediaPresentationDuration_ = null;
    /** @type {string} */
    this.parserMode_ = ParserMode.INITIAL_FULL_MPD;
  }

  /**
   * @param {Element} manifest
   */
  patchMpdPreProcessor(manifest) {
    // createElementNS is being used here over createElement to preserve
    // the capitalisation of the first letter.
    const patch = document.createElementNS('', 'PatchLocation');
    // eslint-disable-next-line no-useless-concat
    patch['inner'+'HTML'] = this.getPatchManifestUrl_();
    manifest.appendChild(patch);
    this.processManifest_(manifest);
    this.parserMode_ = ParserMode.PATCH_MPD;
  }

  /**
   * @param {Element} manifest
   * @return {Array<shakaDemo.MPDPatchAdapter.Patch>}
   * @private
   */
  processManifest_(manifest) {
    /** @type {Array<shakaDemo.MPDPatchAdapter.Patch>} */
    const additions = [];

    const mediaPresentationDuration =
        manifest.getAttribute('mediaPresentationDuration');
    if (this.mediaPresentationDuration_ != mediaPresentationDuration) {
      if (this.parserMode_ == ParserMode.PATCH_MPD) {
        additions.push({
          xpathLocation: '/MPD/@mediaPresentationDuration',
          type: this.mediaPresentationDuration_ ?
              PatchType.REPLACE : PatchType.ADD,
          element: document.createTextNode(mediaPresentationDuration),
        });
      }
      this.mediaPresentationDuration_ = mediaPresentationDuration;
    }

    const manifestType = manifest.getAttribute('type') || '';
    if (this.manifestType_ != manifestType) {
      this.manifestType_ = manifestType;
      if (this.parserMode_ == ParserMode.PATCH_MPD) {
        additions.push({
          xpathLocation: '/MPD/@type',
          type: PatchType.REPLACE,
          element: document.createTextNode(manifestType),
        });
      }
    }

    const periods = this.getPeriods_(manifest);
    const lastPeriod = periods[periods.length - 1];

    // We're doing backward loop as new periods and segments should appear
    // at the end of manifest.
    for (let i = periods.length - 1; i >= 0; i--) {
      const period = periods[i];

      // On the initial pass we will only look at the last period
      if (this.parserMode_ === ParserMode.INITIAL_FULL_MPD &&
            period !== lastPeriod) {
        const periodCacheKey = this.getCacheKeyForPeriod_(period);
        this.periodContext_.add(periodCacheKey);
        continue;
      }

      const periodCacheKey = this.getCacheKeyForPeriod_(period);
      const addingCompletePeriod = !this.periodContext_.has(periodCacheKey);
      if (addingCompletePeriod) {
        this.periodContext_.add(periodCacheKey);

        if (this.parserMode_ === ParserMode.PATCH_MPD) {
          additions.unshift({
            xpathLocation: '/MPD/',
            element: period,
            type: PatchType.ADD,
          });
        }
      }

      for (const adaptationSet of this.getAdaptationSets_(period) || []) {
        const representations = this.getRepresentations_(adaptationSet);

        if (!adaptationSet.hasAttribute('id')) {
          const adaptationSetId = this.generateAdaptationSetId_(
              adaptationSet, representations[representations.length - 1]);
          adaptationSet.setAttribute('id', adaptationSetId);
        }

        // This is a peacock optimisation as we assume if there
        // is a segment timeline this will be identical in all
        // child representations.
        const segmentTemplate = this.getSegmentTemplate_(adaptationSet);
        if (segmentTemplate) {
          this.processSegmentTemplate_(additions, segmentTemplate,
              addingCompletePeriod, period, adaptationSet);
        } else {
          for (const representation of representations || []) {
            const segmentTemplate = this.getSegmentTemplate_(representation);
            if (segmentTemplate) {
              this.processSegmentTemplate_(additions, segmentTemplate,
                  addingCompletePeriod, period, adaptationSet, representation);
            }
          }
        }
      }

      // If we're not adding complete period in this iteration, it's clear
      // we already added all new periods and new segments to the last
      // existing period. So, we can easily break parsing here.
      if (!addingCompletePeriod) {
        break;
      }
    }

    return additions;
  }

  /**
   * @param {Array<shakaDemo.MPDPatchAdapter.Patch>} additions
   * @param {Element} segmentTemplate
   * @param {boolean} addingCompletePeriod
   * @param {Element} period
   * @param {Element} adaptationSet
   * @param {Element=} representation
   * @private
   */
  processSegmentTemplate_(
      additions,
      segmentTemplate,
      addingCompletePeriod,
      period,
      adaptationSet,
      representation,
  ) {
    const cacheKey = this.getCacheKeyForSegmentTimeline_(
        period, adaptationSet, representation);
    /** @type {Array<shakaDemo.MPDPatchAdapter.Patch>} */
    const segmentPatches = [];

    const segmentTimeline = this.getSegmentTimeline_(segmentTemplate);
    if (segmentTimeline) {
      const segmentTags = this.getSegment_(segmentTimeline);
      const lastSegmentSeen = this.segmentContext_.get(cacheKey) || 0;
      let lastEndTime = 0;

      for (const segmentTag of segmentTags || []) {
        let additionalSegments = 0;
        /** @type {number} */
        let firstNewSegmentStartTime;
        const t = Number(segmentTag.getAttribute('t') || lastEndTime);
        const d = Number(segmentTag.getAttribute('d'));
        const r = Number(segmentTag.getAttribute('r') || 0);

        let startTime = t;

        for (let j = 0; j <= r; ++j) {
          const endTime = startTime + d;

          if (endTime > lastSegmentSeen) {
            this.segmentContext_.set(cacheKey, endTime);
            additionalSegments++;
            if (!firstNewSegmentStartTime) {
              firstNewSegmentStartTime = startTime;
            }
          }
          startTime = endTime;
          lastEndTime = endTime;
        }
        if (additionalSegments > 0 && !addingCompletePeriod) {
          // createElementNS is being used here over createElement to preserve
          // the capitalisation of the first letter.
          const newSegment = document.createElementNS('', 'S');
          newSegment.setAttribute('d', d.toString());
          newSegment.setAttribute('t', firstNewSegmentStartTime.toString());
          if (additionalSegments > 1) {
            // minus one repeat for the original
            newSegment.setAttribute('r', (additionalSegments - 1).toString());
          }

          if (this.parserMode_ === ParserMode.PATCH_MPD) {
            segmentPatches.push({
              xpathLocation: this.getSegmentXpathLocation_(
                  period, adaptationSet, representation),
              element: newSegment,
              type: PatchType.ADD,
            });
          }
        }
      }
    }
    additions.unshift(...segmentPatches.values());
  }


  /**
   * @param {string} url
   */
  customPatchHandler(url) {
    const manifestUrl = this.getManifestUrlFromPatch_(url);
    const start = (performance && performance.now()) || Date.now();
    const fetchPromise = fetch(manifestUrl).then((response) => {
      const end = (performance && performance.now()) || Date.now();
      const parser = new DOMParser();
      return response.text().then((body) => {
        const manifest = parser.parseFromString(body, 'text/xml');
        const additions = this.processManifest_(manifest.documentElement);
        const patchManifest = this.generatePatch_(
            manifest.documentElement, additions);

        const buffer = shaka.util.StringUtils.toUTF8(
            // eslint-disable-next-line no-useless-concat
            patchManifest['outer'+'HTML']);

        const data = {
          timeMs: end - start,
          fromCache: false,
          data: buffer,
        };
        return data;
      });
    });


    /** @type {!shaka.util.AbortableOperation} */
    const op = new shaka.util.AbortableOperation(
        fetchPromise, () => {
          return Promise.resolve();
        });

    return op;
  }

  /**
   * @param {Element} manifest
   * @param {Array<shakaDemo.MPDPatchAdapter.Patch>} additions
   * @return {Element}
   * @private
   */
  generatePatch_(manifest, additions) {
    const patch = document.createElementNS('', 'Patch');
    patch.setAttribute('mpdId', 'channel');
    patch.setAttribute('publishTime',
        manifest.getAttribute('publishTime') || '');
    this.appendXmlNamespaces_(manifest, patch);
    this.generateAdditions_(patch, additions);
    return patch;
  }

  /**
   * @param {Element} originalManifest
   * @param {Element} patchManifest
   * @private
   */
  appendXmlNamespaces_(originalManifest, patchManifest) {
    for (const node of originalManifest.attributes) {
      if (node.name.includes('xmlns')) {
        if (node.name === 'xmlns') {
          const namespaces = node.value.split(':');
          namespaces.push('mpdpatch', '2020');
          patchManifest.setAttribute('xmlns', namespaces.join(':'));
        } else {
          patchManifest.setAttribute(node.name,
              originalManifest.getAttribute(node.name));
        }
      }
    }
    patchManifest.setAttribute('xmlns:p',
        'urn:ietf:params:xml:schema:patchops');
  }

  /**
   * @param {Element} patchElement
   * @param {Array<shakaDemo.MPDPatchAdapter.Patch>} additions
   * @private
   */
  generateAdditions_(patchElement, additions) {
    for (const patch of additions.values()) {
      const patchChange = document.createElementNS('p', `p:${patch.type}`);
      patchChange.setAttribute('sel', patch.xpathLocation);
      if (patch.element) {
        patchChange.appendChild(patch.element);
      }
      patchElement.appendChild(patchChange);
    }
  }

  /** @private */
  getPatchManifestUrl_() {
    // This method replaces the protocol 'https' with 'patch'
    // so it is handled with via the patch network scheme
    return this.manifestUrl_.replace('https', 'patch');
  }

  /**
   * @param {string} url
   * @return {string}
   * @private
   */
  getManifestUrlFromPatch_(url) {
    // This is intentionally different from the method above
    // as we want to request the smaller 2 minute window manifest
    // and not the full window.
    // https://github.com/sky-uk/core-video-sdk-js/pull/5428#discussion_r1038259178
    return url.replace('patch', 'https');
  }

  /**
   * @param {Element} adaptationSet
   * @param {Element} representation
   * @return {string}
   * @private
   */
  generateAdaptationSetId_(adaptationSet, representation) {
    const mimeType = adaptationSet.getAttribute('mimeType');
    const lang = adaptationSet.getAttribute('lang');
    let adaptationSetId = `${mimeType}#${lang}`;
    if (mimeType === 'audio/mp4') {
      const representationId = representation.getAttribute('id');
      adaptationSetId += `#${representationId}`;
    }
    return adaptationSetId;
  }

  /**
   * @param {Element} element
   * @return {?Array<Element>}
   * @private
   */
  getPeriods_(element) {
    return findChildren(element, 'Period');
  }

  /**
   * @param {Element} element
   * @return {Array<Element>}
   * @private
   */
  getRepresentations_(element) {
    return findChildren(element, 'Representation');
  }

  /**
   * @param {Element} element
   * @return {Array<Element>}
   * @private
   */
  getAdaptationSets_(element) {
    return findChildren(element, 'AdaptationSet');
  }

  /**
   * @param {Element} element
   * @return {Element}
   * @private
   */
  getSegmentTemplate_(element) {
    const segmentTemplates = findChildren(
        element, 'SegmentTemplate');
    return segmentTemplates.length ? segmentTemplates[0] : null;
  }

  /**
   * @param {Element} element
   * @return {Element}
   * @private
   */
  getSegmentTimeline_(element) {
    const segmentTimeline = findChildren(
        element, 'SegmentTimeline');
    return segmentTimeline.length ? segmentTimeline[0] : null;
  }

  /**
   * @param {Element} element
   * @return {Array<Element>}
   * @private
   */
  getSegment_(element) {
    return findChildren(element, 'S');
  }

  /**
   * @param {Element} period
   * @return {string}
   * @private
   */
  getCacheKeyForPeriod_(period) {
    return `P_${period.getAttribute('id')}`;
  }

  /**
   * @param {Element} period
   * @param {Element} adaptationSet
   * @param {Element=} representation
   * @return {string}
   * @private
   */
  getCacheKeyForSegmentTimeline_(period, adaptationSet, representation) {
    return `${this.getCacheKeyForPeriod_(period)}_AS_${
      adaptationSet.getAttribute('id')}_R_${
      (representation && representation.getAttribute('id')) || 'xx'}`;
  }

  /**
   * @param {Element} period
   * @param {Element} adaptationSet
   * @param {Element=} representation
   * @return {string}
   * @private
   */
  getSegmentXpathLocation_(period, adaptationSet, representation) {
    const representationCriteria = representation ?
        `/Representation[@id='${representation.getAttribute('id')}']` : '';

    return `/MPD/Period[@id='${period.getAttribute('id')
    }']/AdaptationSet[@id='${adaptationSet.getAttribute(
        'id',
    )}']${representationCriteria}/SegmentTemplate/SegmentTimeline`;
  }
};
