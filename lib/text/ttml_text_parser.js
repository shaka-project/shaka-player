/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.TtmlTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.URL');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.TtmlTextParser = class {
  constructor() {
    /** @private {string} */
    this.manifestType_ = shaka.media.ManifestParser.UNKNOWN;
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'TTML does not have init segments');
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    this.manifestType_ = manifestType;
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri, images) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const ns = TtmlTextParser.ttmlNs_;
    const ttpNs = TtmlTextParser.parameterNs_;
    const ttsNs = TtmlTextParser.styleNs_;
    const str = shaka.util.StringUtils.fromUTF8(data);
    const cues = [];

    // dont try to parse empty string as
    // DOMParser will not throw error but return an errored xml
    if (str == '') {
      return cues;
    }

    const tt = TXml.parse(str, /* includeParent= */ true)
        .find((node) => TXml.isElementNS(node, ns, 'tt'));
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Failed to parse TTML.');
    }

    const body = TXml.getElementsByTagNameNS(tt, ns, 'body')[0];
    if (!body) {
      return [];
    }

    const getParameter = (name) => TXml.getAttributeNSList(
        /** @type {!shaka.extern.xml.Node} */ (tt), ttpNs, name);
    const spaceStyle = tt.attributes['xml:space'] || 'default';
    const extent = TXml.getAttributeNSList(tt, ttsNs, 'extent');

    if (spaceStyle != 'default' && spaceStyle != 'preserve') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Invalid xml:space value: ' + spaceStyle);
    }
    const collapseMultipleSpaces = spaceStyle == 'default';

    // Get the framerate, subFrameRate and frameRateMultiplier if applicable.
    const rateInfo = new TtmlTextParser.RateInfo_(
        getParameter('frameRate'), getParameter('subFrameRate'),
        getParameter('frameRateMultiplier'), getParameter('tickRate'));

    const cellResolutionInfo =
        this.getCellResolution_(getParameter('cellResolution'));

    const metadata = TXml.getElementsByTagNameNS(tt, ns, 'metadata')[0];
    const metadataElements =
        (metadata ? metadata.children : []).filter((c) => c != '\n');
    const styles = TXml.getElementsByTagNameNS(tt, ns, 'style');
    const regionElements = TXml.getElementsByTagNameNS(tt, ns, 'region');

    /** @type {!shaka.text.TtmlTextParser.Intervals_} */
    const intervals = new Map();
    const cueRegions = [];
    // The cues which paint the background of the regions without content.
    const backgrounds = [];
    for (let i = 0; i < regionElements.length; i++) {
      const region = regionElements[i];
      const cueRegion = this.parseCueRegion_(
          region, styles, extent, cellResolutionInfo);
      if (!cueRegion) {
        continue;
      }
      cueRegions.push(cueRegion);
      const interval = this.resolveTiming_(
          region, rateInfo, /* implicitBegin= */ 0, /* isInSeq= */ false,
          intervals);
      // The background of a region is shown even without content by default,
      // during the whole segment.
      if (this.getStyleAttributeFromRegion_(
          region, styles, 'showBackground') != 'whenActive' &&
          !TtmlTextParser.transparentColor_.test(cueRegion.backgroundColor)) {
        const background = new shaka.text.Cue(
            Math.max(interval.start + time.periodStart, time.segmentStart),
            Math.min(interval.end + time.periodStart, time.segmentEnd), '');
        background.region = cueRegion;
        // It has no text to show in a native text track.
        background.isContainer = true;
        // The region element may be created for it, so it aligns the content
        // of the region like the content does.
        background.displayAlign = /** @type {shaka.text.Cue.displayAlign} */ (
          this.getStyleAttributeFromRegion_(region, styles, 'displayAlign') ||
          background.displayAlign);
        backgrounds.push(background);
      }
    }

    // A <body> element should only contain <div> elements, not <p> or <span>
    // elements.  We used to allow this, but it is non-compliant, and the
    // loose nature of our previous parser made it difficult to implement TTML
    // nesting more fully.
    if (TXml.findChildrenNS(body, ns, 'p').length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          '<p> can only be inside <div> in TTML');
    }

    // A <div> element should only contain <p>, not <span>.
    if (TXml.findChildrenNS(body, ns, 'div').some(
        (div) => TXml.findChildrenNS(div, ns, 'span').length)) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          '<span> can only be inside <p> in TTML');
    }

    this.resolveTiming_(
        body, rateInfo, /* implicitBegin= */ 0, /* isInSeq= */ false,
        intervals);

    // When the content is flowed into regions, the content which is not in any
    // region is not presented.  Documents which define regions without using
    // them are presented as if they had no regions.
    const usesRegions = cueRegions.length > 0 && Array.from(intervals.keys())
        .some((element) => !!element.attributes['region']);

    const bodyCues = this.parseCue_(
        body, time, rateInfo, metadataElements, styles,
        regionElements, cueRegions, collapseMultipleSpaces,
        cellResolutionInfo, /* parentCueElement= */ null,
        /* isContent= */ false, uri, images, intervals,
        /* parentInterval= */ {start: 0, end: Infinity}, usesRegions);
    for (let i = 0; i < bodyCues.length; i++) {
      // According to the TTML spec, backgrounds default to transparent.
      // So default the background of the top-level element to transparent.
      // Nested elements may override that background color already.
      const cue = bodyCues[i];
      cue.backgroundColor = cue.backgroundColor || 'transparent';
    }
    // The backgrounds of the regions are below the content, and only shown
    // while a timed body is.  The body is only split if it is animated, which
    // is not supported with them.
    if (bodyCues.length == 1) {
      const bodyCue = bodyCues[0];
      const isTimed = TtmlTextParser.hasTimeAttributes_(body);
      const shown = backgrounds.filter((background) =>
        TtmlTextParser.clipCue_(background,
            isTimed ? bodyCue.startTime : -Infinity,
            isTimed ? bodyCue.endTime : Infinity));
      bodyCue.nestedCues = shown.concat(bodyCue.nestedCues);
      for (let i = 0; i < shown.length; i++) {
        bodyCue.startTime = Math.min(bodyCue.startTime, shown[i].startTime);
        bodyCue.endTime = Math.max(bodyCue.endTime, shown[i].endTime);
      }
    }

    return bodyCues;
  }

  /**
   * @param {!shaka.extern.xml.Node} element
   * @return {boolean} True if the element has a begin, end or dur attribute.
   * @private
   */
  static hasTimeAttributes_(element) {
    return !!(element.attributes['begin'] || element.attributes['end'] ||
        element.attributes['dur']);
  }

  /**
   * Parses a TTML node into a Cue.
   *
   * @param {!shaka.extern.xml.Node} cueNode
   * @param {shaka.extern.TextParser.TimeContext} timeContext
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {!Array<!shaka.extern.xml.Node>} metadataElements
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {!Array<!shaka.extern.xml.Node>} regionElements
   * @param {!Array<!shaka.text.CueRegion>} cueRegions
   * @param {boolean} collapseMultipleSpaces
   * @param {?{columns: number, rows: number}} cellResolution
   * @param {?shaka.extern.xml.Node} parentCueElement
   * @param {boolean} isContent
   * @param {?(string|undefined)} uri
   * @param {!Array<string>} images
   * @param {!shaka.text.TtmlTextParser.Intervals_} intervals The intervals
   *   resolved by resolveTiming_.
   * @param {shaka.text.TtmlTextParser.Interval_} parentInterval The active
   *   interval of the parent element.
   * @param {boolean} usesRegions Whether the content is flowed into regions,
   *   so that the content which is not in any region is not presented.
   * @return {!Array<!shaka.text.Cue>} The cues of the node, as an animated
   *   element is split into several cues.
   * @private
   */
  parseCue_(
      cueNode, timeContext, rateInfo, metadataElements, styles, regionElements,
      cueRegions, collapseMultipleSpaces, cellResolution, parentCueElement,
      isContent, uri, images, intervals, parentInterval, usesRegions) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const StringUtils = shaka.util.StringUtils;
    /** @type {shaka.extern.xml.Node} */
    let cueElement;

    // The active interval of an element is its own interval, clipped to the
    // interval of its parent.
    /** @type {?shaka.text.TtmlTextParser.Interval_} */
    let interval;
    if (TXml.isText(cueNode)) {
      // Anonymous spans have no duration in a sequential time container, and
      // last as long as their parent otherwise.
      interval = parentCueElement &&
          TtmlTextParser.isSeqContainer_(parentCueElement) ?
          null : parentInterval;
    } else {
      const own = intervals.get(cueNode);
      interval = own ? {
        start: Math.max(own.start, parentInterval.start),
        end: Math.min(own.end, parentInterval.end),
      } : parentInterval;
    }

    // The region of the element, which may be inherited.  The content is only
    // presented while its region is active.
    const element = TXml.isText(cueNode) ? parentCueElement : cueNode;
    const regionNode = element ? this.getElementsFromCollection_(
        element, 'region', regionElements, /* prefix= */ '')[0] : null;
    const regionInterval = regionNode ? intervals.get(regionNode) : null;
    if (interval && regionInterval) {
      interval = {
        start: Math.max(interval.start, regionInterval.start),
        end: Math.min(interval.end, regionInterval.end),
      };
    }
    if (!interval || interval.start >= interval.end) {
      return [];
    }
    // Text which is not in any region is not presented, when the content is
    // flowed into regions.
    const isPresented = !usesRegions || !!regionNode;

    if (TXml.isText(cueNode)) {
      if (!isContent || !isPresented) {
        // Ignore text elements outside the content. For example, whitespace
        // on the same lexical level as the <p> elements, in a document with
        // xml:space="preserve", should not be renderer.
        return [];
      }
      // This should generate an "anonymous span" according to the TTML spec.
      // So pretend the element was a <span>.  Its timing was resolved above,
      // from the parent element.
      /** @type {shaka.extern.xml.Node} */
      const span = {
        tagName: 'span',
        children: [TXml.getTextContents(cueNode)],
        attributes: {},
        parent: null,
      };
      cueElement = span;
    } else {
      cueElement = cueNode;
    }
    goog.asserts.assert(cueElement, 'cueElement should be non-null!');

    let imageElement = null;
    const smpteNsList = TtmlTextParser.smpteNsList_;
    for (let i = 0; i < smpteNsList.length && !imageElement; i++) {
      imageElement = this.getElementsFromCollection_(
          cueElement, 'backgroundImage', metadataElements, '#',
          smpteNsList[i])[0];
    }

    let imageUri = null;
    const backgroundImage = TXml.getAttributeNSList(
        cueElement,
        shaka.text.TtmlTextParser.smpteNsList_,
        'backgroundImage');
    const imsc1ImgUrnTester =
        /^(urn:)(mpeg:[a-z0-9][a-z0-9-]{0,31}:)(subs:)([0-9]+)$/;
    if (backgroundImage && imsc1ImgUrnTester.test(backgroundImage)) {
      const index = parseInt(backgroundImage.split(':').pop(), 10) -1;
      if (index >= images.length) {
        return [];
      }
      imageUri = images[index];
    } else if (uri && backgroundImage && !backgroundImage.startsWith('#')) {
      const newUri = shaka.util.URL.resolve(uri, backgroundImage);
      if (newUri) {
        imageUri = newUri;
      }
    }

    const name = TtmlTextParser.getName_(cueNode);
    if (name == 'p' || imageElement || imageUri) {
      isContent = true;
    }

    const parentIsContent = isContent;

    const spaceStyle = cueElement.attributes['xml:space'] ||
        (collapseMultipleSpaces ? 'default' : 'preserve');

    const localCollapseMultipleSpaces = spaceStyle == 'default';

    // Elements which are not content, such as <metadata>, <set> or foreign
    // elements, are not presented.
    const contentChildren = cueElement.children.filter((child) =>
      TXml.isText(child) || TtmlTextParser.isContentElement_(child));

    // Parse any nested cues first.
    const isLeafNode = contentChildren.every(TXml.isText);
    /** @type {!Array<!shaka.text.Cue>} */
    let nestedCues = [];
    if (!isLeafNode) {
      // Otherwise, recurse into the children.  Text nodes will convert into
      // anonymous spans, which will then be leaf nodes.
      for (let i = 0; i < contentChildren.length; i++) {
        // This node may or may not generate nested cues.
        nestedCues = nestedCues.concat(this.parseCue_(
            contentChildren[i],
            timeContext,
            rateInfo,
            metadataElements,
            styles,
            regionElements,
            cueRegions,
            localCollapseMultipleSpaces,
            cellResolution,
            cueElement,
            isContent,
            uri,
            images,
            intervals,
            interval,
            usesRegions,
        ));
      }
    }

    const isNested = /** @type {boolean} */ (parentCueElement != null);

    const textContent = TXml.getTextContents(cueElement);
    // In this regex, "\S" means "non-whitespace character".
    const hasTextContent = cueElement.children.length &&
        textContent &&
        /\S/.test(textContent);

    if (isLeafNode && hasTextContent && !isPresented) {
      return [];
    }

    const hasTimeAttributes = TtmlTextParser.hasTimeAttributes_(cueElement);

    if (!hasTimeAttributes && !hasTextContent && name != 'br' &&
        nestedCues.length == 0) {
      if (!isNested) {
        // Disregards empty <p> elements without time attributes nor content.
        // <p begin="..." smpte:backgroundImage="..." /> will go through,
        // as some information could be held by its attributes.
        // <p /> won't, as it would not be displayed.
        return [];
      } else if (localCollapseMultipleSpaces) {
        // Disregards empty anonymous spans when (local) trim is true.
        return [];
      }
    }

    let start = interval.start + timeContext.periodStart;
    // An infinite end means that the duration is indefinite.
    let end = interval.end + timeContext.periodStart;

    if (this.manifestType_ !== shaka.media.ManifestParser.HLS) {
      // Clip times to segment boundaries.
      // https://github.com/shaka-project/shaka-player/issues/4631
      start = Math.max(start, timeContext.segmentStart);
      end = Math.min(end, timeContext.segmentEnd);
    }

    if (!hasTimeAttributes && nestedCues.length > 0) {
      // If no time is defined for this cue, base the timing information on
      // the time of the nested cues. In the case of multiple nested cues with
      // different start times, it is the text displayer's responsibility to
      // make sure that only the appropriate nested cue is drawn at any given
      // time.
      start = Infinity;
      end = 0;
      for (let i = 0; i < nestedCues.length; i++) {
        start = Math.min(start, nestedCues[i].startTime);
        end = Math.max(end, nestedCues[i].endTime);
      }
    }

    if (name == 'br') {
      const cue = new shaka.text.Cue(start, end, '');
      cue.lineBreak = true;
      return [cue];
    }

    let payload = '';
    // The text of a <p> which is a sequential time container is made of
    // anonymous spans, which have no duration there.
    if (isLeafNode &&
        !(name == 'p' && TtmlTextParser.isSeqContainer_(cueElement))) {
      // If the childNodes are all text, this is a leaf node.  Get the payload.
      payload = StringUtils.htmlUnescape(textContent || '');
      if (localCollapseMultipleSpaces) {
        // Collapse multiple spaces into one.
        payload = payload.replace(/\s+/g, ' ');
      }
    }

    const cue = new shaka.text.Cue(start, end, payload);
    cue.nestedCues = nestedCues;

    if (!isContent) {
      // If this is not a <p> element or a <div> with images, and it has no
      // parent that was a <p> element, then it's part of the outer containers
      // (e.g. the <body> or a normal <div> element within it).
      cue.isContainer = true;
    }

    if (cellResolution) {
      cue.cellResolution = cellResolution;
    }

    // Do not actually apply the region unless it is non-inherited, though.
    // This makes it so that, if a parent element has a region, the children
    // don't also all independently apply the positioning of that region.
    if (cueElement.attributes['region'] && regionNode) {
      cue.region = /** @type {shaka.text.CueRegion} */ (cueRegions.find(
          (region) => region.id == regionNode.attributes['xml:id']));
    }

    /** @type {function(!shaka.text.Cue, !shaka.extern.xml.Node)} */
    const addStyle = (target, element) => this.addStyle_(
        target,
        element,
        parentCueElement,
        regionNode,
        /** @type {!shaka.extern.xml.Node} */(imageElement),
        imageUri,
        styles,
        /** isNested= */ parentIsContent, // "nested in a <div>" doesn't count.
        /** isLeaf= */ (nestedCues.length == 0));
    addStyle(cue, cueElement);

    return this.animate_(cue, cueElement, styles, intervals, timeContext,
        addStyle);
  }

  /**
   * Applies the animations of an element, the <set> elements which change its
   * style during their interval, by splitting its cue at their boundaries.
   * The cue is also removed while the element is not displayed.
   * See https://www.w3.org/TR/ttml1/#animation-vocabulary-set
   *
   * @param {!shaka.text.Cue} cue
   * @param {!shaka.extern.xml.Node} element
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {!shaka.text.TtmlTextParser.Intervals_} intervals
   * @param {shaka.extern.TextParser.TimeContext} timeContext
   * @param {function(!shaka.text.Cue, !shaka.extern.xml.Node)} addStyle Adds
   *   the style of an element to a cue.
   * @return {!Array<!shaka.text.Cue>}
   * @private
   */
  animate_(cue, element, styles, intervals, timeContext, addStyle) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    /** @type {function(!shaka.extern.xml.Node):boolean} */
    const isDisplayed = (e) =>
      this.getSpecifiedStyleAttribute_(e, styles, 'display') != 'none';
    const sets = shaka.util.TXml.findChildrenNS(
        element, TtmlTextParser.ttmlNs_, 'set');
    if (!sets.length) {
      return isDisplayed(element) ? [cue] : [];
    }
    /**
     * @param {!shaka.extern.xml.Node} set
     * @param {string} edge
     * @return {number}
     */
    const getTime = (set, edge) =>
      intervals.get(set)[edge] + timeContext.periodStart;
    /**
     * @param {number} start
     * @param {number} end
     * @return {shaka.text.Cue} The cue of the element during that interval,
     *   with the style of the animations active then, or null if it is not
     *   displayed.
     */
    const animate = (start, end) => {
      const animated = /** @type {!shaka.extern.xml.Node} */ (Object.assign(
          {}, element, {attributes: Object.assign({}, element.attributes)}));
      const active = sets.filter((set) =>
        getTime(set, 'start') <= start && start < getTime(set, 'end'));
      for (let i = 0; i < active.length; i++) {
        Object.assign(animated.attributes, active[i].attributes);
      }
      if (!isDisplayed(animated)) {
        return null;
      }
      const animatedCue = /** @type {!shaka.text.Cue} */ (
        TtmlTextParser.clipCue_(cue.clone(), start, end));
      if (active.length) {
        animatedCue.textDecoration = [];
        addStyle(animatedCue, animated);
      }
      return animatedCue;
    };

    // The times the style of the element changes.
    const times = [cue.startTime, cue.endTime];
    for (let i = 0; i < sets.length; i++) {
      times.push(getTime(sets[i], 'start'), getTime(sets[i], 'end'));
    }
    const boundaries = Array.from(new Set(times))
        .filter((time) => time >= cue.startTime && time <= cue.endTime)
        .sort((a, b) => a - b);
    const cues = [];
    for (let i = 1; i < boundaries.length; i++) {
      const animatedCue = animate(boundaries[i - 1], boundaries[i]);
      if (animatedCue) {
        cues.push(animatedCue);
      }
    }
    return cues;
  }

  /**
   * Clips the times of a cue and of its nested cues to an interval.
   *
   * @param {!shaka.text.Cue} cue
   * @param {number} start
   * @param {number} end
   * @return {shaka.text.Cue} The cue, or null if it is outside of the
   *   interval.
   * @private
   */
  static clipCue_(cue, start, end) {
    cue.startTime = Math.max(cue.startTime, start);
    cue.endTime = Math.min(cue.endTime, end);
    if (cue.startTime >= cue.endTime) {
      return null;
    }
    cue.nestedCues = cue.nestedCues.filter((nestedCue) =>
      shaka.text.TtmlTextParser.clipCue_(nestedCue, start, end));
    return cue;
  }

  /**
   * Parses an Element into a TextTrackCue or VTTCue.
   *
   * @param {!shaka.extern.xml.Node} regionElement
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * Defined in the top of tt element and used principally for images.
   * @param {?string} globalExtent
   * @param {?{columns: number, rows: number}} cellResolution
   * @return {shaka.text.CueRegion}
   * @private
   */
  parseCueRegion_(regionElement, styles, globalExtent, cellResolution) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const region = new shaka.text.CueRegion();
    const id = regionElement.attributes['xml:id'];
    if (!id) {
      shaka.log.warning('TtmlTextParser parser encountered a region with ' +
                        'no id. Region will be ignored.');
      return null;
    }
    region.id = id;

    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const getRegionStyle = (attribute) =>
      this.getStyleAttributeFromRegion_(regionElement, styles, attribute);

    // The size of the root container, in pixels.
    const globalResults =
        TtmlTextParser.percentValues_.exec(globalExtent || '') ||
        TtmlTextParser.pixelValues_.exec(globalExtent || '');
    const globalWidth = globalResults ? Number(globalResults[1]) : null;
    const globalHeight = globalResults ? Number(globalResults[2]) : null;

    /**
     * @param {?string} value
     * @return {Array<?>} The two lengths, in percentage of the root container
     *   if they are in pixels and its size is known, and whether they are
     *   percentages, or null if the value is not a pair of lengths.
     */
    const parsePair = (value) => {
      const percentage = TtmlTextParser.percentValues_.exec(value || '');
      const results = percentage ||
          TtmlTextParser.pixelValues_.exec(value || '');
      const scale = (length, globalLength) => percentage ||
          globalLength == null ? length : length * 100 / globalLength;
      return results ? [
        scale(Number(results[1]), globalWidth),
        scale(Number(results[2]), globalHeight),
        !!percentage,
      ] : null;
    };
    /**
     * @param {boolean} isPercentage
     * @param {?number} globalLength
     * @return {shaka.text.CueRegion.units}
     */
    const getUnits = (isPercentage, globalLength) =>
      isPercentage || globalLength != null ? percentageUnit :
          shaka.text.CueRegion.units.PX;

    const extentValue = getRegionStyle('extent');
    const extent = parsePair(extentValue);
    if (extent) {
      region.width = extent[0];
      region.height = extent[1];
      region.widthUnits = getUnits(extent[2], globalWidth);
      region.heightUnits = getUnits(extent[2], globalHeight);
    }

    const originValue = getRegionStyle('origin');
    const origin = parsePair(originValue);
    if (origin) {
      region.viewportAnchorX = origin[0];
      region.viewportAnchorY = origin[1];
      if (origin[2] && !extentValue) {
        region.width = 100 - region.viewportAnchorX;
        region.widthUnits = percentageUnit;
        region.height = 100 - region.viewportAnchorY;
        region.heightUnits = percentageUnit;
      }
      region.viewportAnchorUnits = getUnits(origin[2], globalWidth);
    }

    const columns = cellResolution ? cellResolution.columns : 32;
    const rows = cellResolution ? cellResolution.rows : 15;
    /**
     * Converts a length to a percentage of the width or the height of the root
     * container.
     *
     * @param {string} value
     * @param {boolean} isVertical
     * @return {?number}
     */
    const toRootPercentage = (value, isVertical) => {
      const results = TtmlTextParser.parseLength_(value);
      const length = results ? Number(results[1]) : 0;
      const unit = results ? results[2] : '%';
      if (unit == '%') {
        return null;
      }
      if (unit == 'px') {
        const globalLength = isVertical ? globalHeight : globalWidth;
        return globalLength ? length * 100 / globalLength : null;
      }
      if (unit == 'rw' || unit == 'rh') {
        return (unit == 'rh') == isVertical ? length : null;
      }
      // The default font size is one cell.
      return length * 100 / (isVertical ? rows : columns);
    };

    // The position of the region is ignored if it has an origin.
    const position = getRegionStyle('position');
    if (position && !originValue) {
      const anchor =
          TtmlTextParser.getRegionPosition_(position, region, toRootPercentage);
      if (anchor) {
        region.viewportAnchorX = anchor[0];
        region.viewportAnchorY = anchor[1];
        region.viewportAnchorUnits = percentageUnit;
      }
    }

    // The background of the region is painted on its whole area.
    const backgroundColor = getRegionStyle('backgroundColor');
    if (backgroundColor) {
      region.backgroundColor =
          this.convertTTMLrgbaToHTMLrgba_(backgroundColor);
    }

    const opacity = parseFloat(getRegionStyle('opacity') || '');
    if (!isNaN(opacity)) {
      region.opacity = opacity;
    }

    const padding = getRegionStyle('padding');
    if (padding) {
      region.padding = TtmlTextParser.getRegionPadding_(
          padding, region, getRegionStyle('writingMode'), toRootPercentage);
    }

    // Overflowing content is shown by default, so that content does not
    // disappear when the region is too small for the fonts of the displayer,
    // but it can be hidden explicitly.
    if (getRegionStyle('overflow') == 'hidden') {
      region.overflow = 'hidden';
    }

    const zIndex = getRegionStyle('zIndex');
    if (zIndex && /^-?\d+$/.test(zIndex)) {
      region.zIndex = Number(zIndex);
    }

    return region;
  }

  /**
   * Converts the position of a region to the position of its top left
   * corner, in percentage of the root container.  A percentage of the
   * position is relative to the space which is not occupied by the region,
   * like a CSS background position.
   * See https://www.w3.org/TR/ttml2/#style-value-position
   *
   * @param {string} position
   * @param {!shaka.text.CueRegion} region
   * @param {function(string, boolean):?number} toRootPercentage
   * @return {?Array<number>} The horizontal and vertical positions.
   * @private
   */
  static getRegionPosition_(position, region, toRootPercentage) {
    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const components = position.trim().split(/\s+/);
    if (region.widthUnits != percentageUnit ||
        region.heightUnits != percentageUnit || components.length > 4) {
      return null;
    }
    // The edge of each axis, horizontal first, and the offset from it.
    const sides = [['left', '50%'], ['top', '50%']];
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (/^[a-z]/.test(component)) {
        // With 3 or 4 components, a keyword can be followed by an offset.
        const offset = components.length > 2 &&
            /^[-.\d]/.test(components[i + 1] || '') ? components[++i] : '0%';
        if (component != 'center') {
          sides[/^(top|bottom)$/.test(component) ? 1 : 0] = [component, offset];
        }
      } else if (components.length > 2) {
        return null;
      } else {
        // A bare length is horizontal first, then vertical.
        sides[i][1] = component;
      }
    }

    const anchor = sides.map((side, axis) => {
      const size = axis ? region.height : region.width;
      const results = shaka.text.TtmlTextParser.parseLength_(side[1]);
      const offset = results && results[2] == '%' ?
          Number(results[1]) * (100 - size) / 100 :
          toRootPercentage(side[1], !!axis);
      const isFromEnd = side[0] == 'right' || side[0] == 'bottom';
      return offset == null ? NaN : shaka.text.TtmlTextParser.round_(
          isFromEnd ? 100 - size - offset : offset);
    });
    return anchor.some(isNaN) ? null : anchor;
  }

  /**
   * Converts the padding of a region to its top, right, bottom and left
   * lengths, in pixels or in percentage of the height or width of the region.
   * The padding is expressed as the before, end, after and start lengths,
   * relative to the writing mode of the region.
   * See https://www.w3.org/TR/ttml1/#style-attribute-padding
   *
   * @param {string} padding
   * @param {!shaka.text.CueRegion} region
   * @param {?string} writingMode
   * @param {function(string, boolean):?number} toRootPercentage
   * @return {string}
   * @private
   */
  static getRegionPadding_(padding, region, writingMode, toRootPercentage) {
    const percentageUnit = shaka.text.CueRegion.units.PERCENTAGE;
    const values = padding.trim().split(/\s+/);
    if (values.length > 4) {
      return '';
    }
    // The before, end, after and start lengths.
    const before = values[0];
    const end = values[1] || before;
    const after = values[2] || before;
    const start = values[3] || end;
    // The top, right, bottom and left lengths.
    let sides = [before, end, after, start];
    if (writingMode == 'rltb' || writingMode == 'rl') {
      sides = [before, start, after, end];
    } else if (writingMode == 'tblr') {
      sides = [start, after, end, before];
    } else if (writingMode == 'tbrl' || writingMode == 'tb') {
      sides = [start, before, end, after];
    }
    return sides.map((value, i) => {
      const isVertical = !(i % 2);
      const unit = (shaka.text.TtmlTextParser.parseLength_(value) || [])[2];
      const rootPercentage = toRootPercentage(value, isVertical);
      if (unit == '%' || (unit == 'px' && !rootPercentage)) {
        // A percentage of the region, or pixels without the size of the root
        // container.
        return value;
      }
      const isPercentage = (isVertical ? region.heightUnits :
          region.widthUnits) == percentageUnit;
      const regionLength = isVertical ? region.height : region.width;
      return rootPercentage != null && isPercentage && regionLength ?
          shaka.text.TtmlTextParser.round_(
              rootPercentage * 100 / regionLength) + '%' :
          '0px';
    }).join(' ');
  }

  /**
   * @param {number} value
   * @return {number} The value, without the rounding errors of floating point
   *   numbers, like 0.30000000000000004.
   * @private
   */
  static round_(value) {
    return Number(value.toFixed(4));
  }

  /**
   * Ensures any TTML RGBA's alpha range of 0-255 is converted to 0-1.
   * @param {string} color
   * @return {string}
   * @private
   */
  convertTTMLrgbaToHTMLrgba_(color) {
    const rgba = color.match(/rgba\(([^)]+)\)/);
    if (rgba) {
      const values = rgba[1].split(',').map((value) => value.trim());
      if (values.length == 4) {
        values[3] = String(Number(values[3]) / 255);
        return 'rgba(' + values.join(',') + ')';
      }
    }
    return color;
  }

  /**
   * Adds applicable style properties to a cue.
   *
   * @param {!shaka.text.Cue} cue
   * @param {!shaka.extern.xml.Node} cueElement
   * @param {?shaka.extern.xml.Node} parentElement
   * @param {?shaka.extern.xml.Node} region
   * @param {shaka.extern.xml.Node} imageElement
   * @param {?string} imageUri
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {boolean} isNested
   * @param {boolean} isLeaf
   * @private
   */
  addStyle_(
      cue, cueElement, parentElement, region, imageElement, imageUri, styles,
      isNested, isLeaf) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const Cue = shaka.text.Cue;

    // Styles should be inherited from regions, if a style property is not
    // associated with a Content element (or an anonymous span).
    const shouldInheritRegionStyles = isNested || isLeaf;
    /** @type {function(string):?string} */
    const getStyle = (attribute) => this.getStyleAttribute_(
        cueElement, region, styles, attribute, shouldInheritRegionStyles);
    // The font weight and style and the wrap option of a cue always override
    // those of its parents in the displayer, so they are inherited here.
    /** @type {function(string):?string} */
    const getInheritedStyle = (attribute) => getStyle(attribute) ||
        this.getAncestorStyleAttribute_(parentElement, styles, attribute);

    if (getStyle('direction') == 'rtl') {
      cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    }

    // Direction attribute specifies one-dimensional writing direction
    // (left to right or right to left). Writing mode specifies that
    // plus whether text is vertical or horizontal.
    // They should not contradict each other. If they do, we give
    // preference to writing mode.
    const writingMode = getStyle('writingMode');
    // Set cue's direction if the text is horizontal, and cue's writingMode if
    // it's vertical.  "tb" is the same as "tbrl".
    if (writingMode == 'tblr') {
      cue.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    } else if (writingMode == 'tb' || writingMode == 'tbrl') {
      cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    } else if (writingMode == 'rltb' || writingMode == 'rl') {
      cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    } else if (writingMode) {
      cue.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
    }

    const align = this.getStyleAttribute_(
        cueElement, region, styles, 'textAlign');
    if (align) {
      const alignments = TtmlTextParser.textAlignments_[align] || [];
      cue.positionAlign = alignments[0];
      cue.lineAlign = alignments[1];

      goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
          align.toUpperCase() + ' Should be in Cue.textAlign values!');

      cue.textAlign = Cue.textAlign[align.toUpperCase()];
    } else {
      // Default value is START in the TTML spec: https://bit.ly/32OGmvo
      // But to make the subtitle render consistent with other players and the
      // shaka.text.Cue we use CENTER
      cue.textAlign = Cue.textAlign.CENTER;
    }

    const displayAlign = this.getStyleAttribute_(
        cueElement, region, styles, 'displayAlign');
    if (displayAlign) {
      goog.asserts.assert(displayAlign.toUpperCase() in Cue.displayAlign,
          displayAlign.toUpperCase() +
                          ' Should be in Cue.displayAlign values!');
      cue.displayAlign = Cue.displayAlign[displayAlign.toUpperCase()];
    }

    const color = getStyle('color');
    if (color) {
      cue.color = this.convertTTMLrgbaToHTMLrgba_(color);
    }

    // Background color should not be set on a container.  If this is a nested
    // cue, you can set the background.  If it's a top-level that happens to
    // also be a leaf, you can set the background.
    // See https://github.com/shaka-project/shaka-player/issues/2623
    // This used to be handled in the displayer, but that is confusing.  The Cue
    // structure should reflect what you want to happen in the displayer, and
    // the displayer shouldn't have to know about TTML.
    // The background color is not inherited from the styles of the ancestors,
    // as the displayer paints it behind the descendants already.  The
    // background color of the region is painted on the region.
    const backgroundColor = this.getSpecifiedStyleAttribute_(
        cueElement, styles, 'backgroundColor');
    if (backgroundColor) {
      cue.backgroundColor = this.convertTTMLrgbaToHTMLrgba_(backgroundColor);
    }

    const border = getStyle('border');
    if (border) {
      cue.border = border;
    }

    const fontFamily = getStyle('fontFamily');
    // See https://github.com/sandflow/imscJS/blob/1.1.3/src/main/js/html.js#L1384
    if (fontFamily) {
      cue.fontFamily = TtmlTextParser.genericFontFamilies_[fontFamily] ||
          fontFamily.split(',').filter((font) => font != 'default').join(',');
    }

    if (getInheritedStyle('fontWeight') == 'bold') {
      cue.fontWeight = Cue.fontWeight.BOLD;
    }

    cue.wrapLine = getInheritedStyle('wrapOption') != 'noWrap';

    // The line height only applies to <p> elements, and their spans inherit
    // it.
    const lineHeight = TtmlTextParser.getName_(cueElement) == 'p' ?
        getStyle('lineHeight') : null;
    if (lineHeight && (lineHeight == 'normal' ||
        lineHeight.match(TtmlTextParser.unitValues_) ||
        lineHeight.match(TtmlTextParser.percentValue_))) {
      cue.lineHeight = lineHeight;
    }

    const fontSize = getStyle('fontSize');
    if (fontSize && (fontSize.match(TtmlTextParser.unitValues_) ||
        fontSize.match(TtmlTextParser.percentValue_))) {
      cue.fontSize = this.resolveFontSize_(
          cueElement, parentElement, region, styles) || fontSize;
    }

    const fontStyle = getInheritedStyle('fontStyle');
    if (fontStyle) {
      goog.asserts.assert(fontStyle.toUpperCase() in Cue.fontStyle,
          fontStyle.toUpperCase() +
                          ' Should be in Cue.fontStyle values!');
      cue.fontStyle = Cue.fontStyle[fontStyle.toUpperCase()];
    }

    if (imageElement) {
      // According to the spec, we should use imageType (camelCase), but
      // historically we have checked for imagetype (lowercase).
      // This was the case since background image support was first introduced
      // in PR #1859, in April 2019, and first released in v2.5.0.
      // Now we check for both, although only imageType (camelCase) is to spec.
      const backgroundImageType =
          imageElement.attributes['imageType'] ||
          imageElement.attributes['imagetype'];
      const backgroundImageEncoding = imageElement.attributes['encoding'];
      const backgroundImageData = (TXml.getTextContents(imageElement)).trim();
      if (backgroundImageType == 'PNG' &&
          backgroundImageEncoding == 'Base64' &&
          backgroundImageData) {
        cue.backgroundImage = 'data:image/png;base64,' + backgroundImageData;
      }
    } else if (imageUri) {
      cue.backgroundImage = imageUri;
    }

    const textOutline = getStyle('textOutline');
    if (textOutline == 'none') {
      // The outline of the parent is inherited, unless it is removed.
      cue.textStrokeWidth = '0';
    } else if (textOutline) {
      // The displayer draws the outline around the text.
      const split = TtmlTextParser.splitValues_(textOutline);
      if (TtmlTextParser.toCssLength_(split[0])) {
        // There is no defined color, so default to the text color.
        cue.textStrokeColor = cue.color;
      } else {
        cue.textStrokeColor = this.convertTTMLrgbaToHTMLrgba_(split[0]);
        split.shift();
      }
      const width = split[0] ? TtmlTextParser.toCssLength_(split[0]) : null;
      if (width) {
        cue.textStrokeWidth = width;
      } else {
        // If there is no width, or the width is not a number, don't draw a
        // border.
        cue.textStrokeColor = '';
      }
      // There is an optional blur radius also, but we have no way of
      // replicating that, so ignore it.
    }

    const textShadow = getStyle('textShadow');
    if (textShadow) {
      cue.textShadow = this.convertTextShadow_(textShadow);
    }

    const letterSpacing = getStyle('letterSpacing');
    if (letterSpacing && letterSpacing.match(TtmlTextParser.unitValues_)) {
      cue.letterSpacing = letterSpacing;
    }

    const linePadding = getStyle('linePadding');
    if (linePadding && linePadding.match(TtmlTextParser.unitValues_)) {
      cue.linePadding = linePadding;
    }

    // The opacity is not inherited, as the displayer applies it to the
    // descendants already, and the opacity of the region is applied to the
    // region.
    const opacity = this.getSpecifiedStyleAttribute_(
        cueElement, styles, 'opacity');
    if (opacity) {
      cue.opacity = parseFloat(opacity);
    }

    // Text decoration is an array of values which can come both from the
    // element's style or be inherited from the region and the element's
    // ancestors. All of those values should be applied in that order, so that
    // an element can remove a decoration of its ancestors.  The displayer can't
    // remove the decoration of a parent from its children, so the decoration
    // is only applied to the leaves, which hold the text.
    if (isLeaf) {
      const decorations =
          [this.getStyleAttributeFromRegion_(region, styles, 'textDecoration')]
              .concat(TtmlTextParser.getLineage_(cueElement, parentElement).map(
                  (element) => this.getSpecifiedStyleAttribute_(
                      element, styles, 'textDecoration')));
      for (let i = 0; i < decorations.length; i++) {
        if (decorations[i]) {
          this.addTextDecoration_(cue, decorations[i]);
        }
      }
    }

    // Hidden content takes its place, and the displayer inherits the
    // visibility of the parents.
    const visibility = getStyle('visibility');
    if (visibility == 'hidden' || visibility == 'visible') {
      cue.visibility = visibility;
    }

    const textCombine = getStyle('textCombine');
    if (textCombine) {
      cue.textCombineUpright = textCombine;
    }

    const rubyTag = {'container': 'ruby', 'text': 'rt'}[getStyle('ruby')];
    if (rubyTag) {
      cue.rubyTag = rubyTag;
    }
  }

  /**
   * Converts a tts:textShadow value to a CSS text shadow, where the lengths
   * can also be in cells or relative to the root container, like "1c" or
   * "1rh".
   *
   * @param {string} textShadow
   * @return {string}
   * @private
   */
  convertTextShadow_(textShadow) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    // The commas inside colors like rgba(0,0,0,0) do not separate shadows.
    return textShadow == 'none' ? textShadow :
        textShadow.split(/,(?![^(]*\))/).map((shadow) =>
          TtmlTextParser.splitValues_(shadow).map((value) =>
            TtmlTextParser.toCssLength_(value) ||
                this.convertTTMLrgbaToHTMLrgba_(value)).join(' '),
        ).join(', ');
  }

  /**
   * @param {string} value
   * @return {Array<string>} The number and the unit of the length, at the
   *   indexes 1 and 2, or null if the value is not a length.
   * @private
   */
  static parseLength_(value) {
    return /^(-?\d*\.?\d+)(px|em|c|%|rw|rh)$/.exec(value);
  }

  /**
   * Converts a TTML length to a length for the displayer.  A percentage is
   * relative to the font size.
   *
   * @param {string} value
   * @return {?string} The length in pixels, "em", cells or relative to the
   *   root container, or null if the value is not a length.
   * @private
   */
  static toCssLength_(value) {
    const results = shaka.text.TtmlTextParser.parseLength_(value);
    if (!results) {
      return null;
    }
    return results[2] == '%' ? Number(results[1]) / 100 + 'em' : value;
  }

  /**
   * Splits a value at its spaces, except inside colors like rgba(0, 0, 0, 0).
   *
   * @param {string} value
   * @return {!Array<string>}
   * @private
   */
  static splitValues_(value) {
    return value.trim().split(/\s+(?![^(]*\))/);
  }

  /**
   * @param {!shaka.extern.xml.Node} element
   * @param {?shaka.extern.xml.Node} parentElement
   * @return {!Array<!shaka.extern.xml.Node>} The ancestors of the element,
   *   from the body, and the element.
   * @private
   */
  static getLineage_(element, parentElement) {
    const elements = [element];
    for (let ancestor = parentElement;
      ancestor && shaka.text.TtmlTextParser.getName_(ancestor) != 'tt';
      ancestor = ancestor.parent) {
      elements.unshift(ancestor);
    }
    return elements;
  }

  /**
   * Parses text decoration values and adds/removes them to/from the cue.
   *
   * @param {!shaka.text.Cue} cue
   * @param {string} decoration
   * @private
   */
  addTextDecoration_(cue, decoration) {
    const values = decoration.split(' ');
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value == 'none') {
        cue.textDecoration = [];
        continue;
      }
      // "underline" adds a decoration, and "noUnderline" removes it.
      const add = !value.startsWith('no');
      const decorationValue = shaka.text.TtmlTextParser.textDecorations_[
          (add ? value : value.slice(2)).toLowerCase()];
      if (!add) {
        shaka.util.ArrayUtils.remove(cue.textDecoration, decorationValue);
      } else if (decorationValue &&
          !cue.textDecoration.includes(decorationValue)) {
        cue.textDecoration.push(decorationValue);
      }
    }
  }

  /**
   * Finds a specified attribute on either the original cue element or its
   * associated region and returns the value if the attribute was found.
   *
   * @param {!shaka.extern.xml.Node} cueElement
   * @param {?shaka.extern.xml.Node} region
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @param {boolean=} shouldInheritRegionStyles
   * @return {?string}
   * @private
   */
  getStyleAttribute_(cueElement, region, styles, attribute,
      shouldInheritRegionStyles=true) {
    // An attribute can be specified on region level or in a styling block
    // associated with the region or original element.
    return this.getStyleAttributeFromElement_(cueElement, styles, attribute) ||
        (shouldInheritRegionStyles ?
            this.getStyleAttributeFromRegion_(region, styles, attribute) :
            null);
  }

  /**
   * Finds a specified attribute on the element's associated region
   * and returns the value if the attribute was found.
   *
   * @param {?shaka.extern.xml.Node} region
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getStyleAttributeFromRegion_(region, styles, attribute) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const ttsNs = TtmlTextParser.styleNs_;

    if (!region) {
      return null;
    }

    // Nested <style> elements take precedence over referenced styles.
    return TXml.getAttributeNSList(region, ttsNs, attribute) ||
        this.getInheritedStyleAttribute_(region, styles, attribute,
            TXml.findChildrenNS(region, TtmlTextParser.ttmlNs_, 'style')) ||
        this.getInheritedStyleAttribute_(region, styles, attribute);
  }

  /**
   * Finds a style attribute specified on an element itself, inline or in the
   * styles it references, but not inherited from its ancestors.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getSpecifiedStyleAttribute_(element, styles, attribute) {
    const TXml = shaka.util.TXml;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;

    return TXml.getAttributeNSList(element, ttsNs, attribute) ||
        (element.attributes['style'] ?
            this.getInheritedStyleAttribute_(element, styles, attribute) :
            null);
  }

  /**
   * Resolves the font size of an element.  A percentage is relative to the
   * font size of the parent element, and to a cell for the region, but the
   * displayer always resolves a percentage relative to a cell.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {?shaka.extern.xml.Node} parentElement
   * @param {?shaka.extern.xml.Node} region
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @return {?string} The font size, in cells, pixels or percentage of a cell,
   *   or null if it can't be resolved.
   * @private
   */
  resolveFontSize_(element, parentElement, region, styles) {
    // The font sizes specified from the region to the element.
    const values =
        [this.getStyleAttributeFromRegion_(region, styles, 'fontSize')]
            .concat(shaka.text.TtmlTextParser.getLineage_(
                element, parentElement).map((e) =>
              this.getSpecifiedStyleAttribute_(e, styles, 'fontSize')))
            .filter((value) => value);
    let size = 0;
    let unit = '';
    for (let i = 0; i < values.length; i++) {
      const results = shaka.text.TtmlTextParser.parseLength_(values[i]);
      if (!results || !['px', 'c', '%'].includes(results[2])) {
        // Other units, like "em", are left to the displayer.
        return null;
      }
      if (results[2] == '%' && unit) {
        size = size * Number(results[1]) / 100;
      } else {
        size = Number(results[1]);
        unit = results[2];
      }
    }
    // A single font size does not need to be resolved.
    return values.length > 1 ?
        shaka.text.TtmlTextParser.round_(size) + unit : null;
  }

  /**
   * Finds a style attribute specified on an element or on its closest
   * ancestor which specifies it.
   *
   * @param {?shaka.extern.xml.Node} element
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getAncestorStyleAttribute_(element, styles, attribute) {
    const TXml = shaka.util.TXml;
    const ns = shaka.text.TtmlTextParser.ttmlNs_;

    for (; element && !TXml.isElementNS(element, ns, 'tt');
      element = element.parent) {
      const attr = this.getSpecifiedStyleAttribute_(element, styles, attribute);
      if (attr) {
        return attr;
      }
    }
    return null;
  }

  /**
   * Finds a specified attribute on the cue element and returns the value
   * if the attribute was found.
   *
   * @param {!shaka.extern.xml.Node} cueElement
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getStyleAttributeFromElement_(cueElement, styles, attribute) {
    // Styling on elements should take precedence
    // over the main styling attributes
    return shaka.util.TXml.getAttributeNSList(
        cueElement, shaka.text.TtmlTextParser.styleNs_, attribute) ||
        this.getInheritedStyleAttribute_(cueElement, styles, attribute);
  }

  /**
   * Finds a specified attribute on an element's styles and the styles those
   * styles inherit from.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @param {!Array<!shaka.extern.xml.Node>=} styleElements The styles to look
   *   into, instead of the styles referenced by the element.
   * @return {?string}
   * @private
   */
  getInheritedStyleAttribute_(element, styles, attribute, styleElements) {
    const TXml = shaka.util.TXml;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;
    const ebuttsNs = shaka.text.TtmlTextParser.styleEbuttsNs_;

    const inheritedStyles = styleElements || this.getElementsFromCollection_(
        element, 'style', styles, /* prefix= */ '');

    let styleValue = null;

    // The last value in our styles stack takes the precedence over the others
    for (let i = 0; i < inheritedStyles.length; i++) {
      // Check ebu namespace first, then the tts namespace, then the styles the
      // style inherits from.
      styleValue =
          TXml.getAttributeNS(inheritedStyles[i], ebuttsNs, attribute) ||
          TXml.getAttributeNSList(inheritedStyles[i], ttsNs, attribute) ||
          this.getStyleAttributeFromElement_(
              inheritedStyles[i], styles, attribute) ||
          styleValue;
    }

    return styleValue;
  }


  /**
   * Selects items from |collection| whose id matches |attributeName|
   * from |element|.
   *
   * @param {shaka.extern.xml.Node} element
   * @param {string} attributeName
   * @param {!Array<shaka.extern.xml.Node>} collection
   * @param {string} prefixName
   * @param {string=} nsName
   * @return {!Array<!shaka.extern.xml.Node>}
   * @private
   */
  getElementsFromCollection_(
      element, attributeName, collection, prefixName, nsName) {
    const attributeValue = element && collection.length ?
        this.getInheritedAttribute_(element, attributeName, nsName) : null;
    // There could be multiple items in one attribute
    // <span style="style1 style2">A cue</span>
    return /** @type {!Array<!shaka.extern.xml.Node>} */ (attributeValue ?
        attributeValue.split(' ').map((name) => collection.find(
            (item) => prefixName + item.attributes['xml:id'] == name))
            .filter((item) => item) :
        []);
  }


  /**
   * Traverses upwards from a given node until a given attribute is found.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {string} attributeName
   * @param {string=} nsName
   * @return {?string}
   * @private
   */
  getInheritedAttribute_(element, attributeName, nsName) {
    for (; element; element = element.parent) {
      const value = nsName ?
          shaka.util.TXml.getAttributeNS(element, nsName, attributeName) :
          element.attributes[attributeName];
      if (value) {
        return value;
      }
    }
    return null;
  }

  /**
   * Resolves the interval of an element and of its descendants, following the
   * TTML timing model: an element begins relative to its parent in a parallel
   * time container, and relative to the end of its previous sibling in a
   * sequential one.  Without an explicit end or duration, an element ends with
   * its children, and an element without children lasts until its parent ends
   * in a parallel time container, and has no duration in a sequential one.
   * See https://www.w3.org/TR/ttml1/#timing-time-intervals
   *
   * The intervals are not clipped to the interval of the parent.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {number} implicitBegin The time the explicit times of the element
   *   are relative to.
   * @param {boolean} isInSeq Whether the parent is a sequential time
   *   container.
   * @param {!shaka.text.TtmlTextParser.Intervals_} intervals The resolved
   *   intervals, by element.
   * @return {shaka.text.TtmlTextParser.Interval_}
   * @private
   */
  resolveTiming_(element, rateInfo, implicitBegin, isInSeq, intervals) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const parseTime = (name) =>
      this.parseTimeAttribute_(element.attributes[name], rateInfo);
    const explicitBegin = parseTime('begin');
    const explicitEnd = parseTime('end');
    const explicitDur = parseTime('dur');

    const start = implicitBegin + (explicitBegin || 0);

    const isSeq = TtmlTextParser.isSeqContainer_(element);
    const children = TtmlTextParser.getTimedChildren_(element);
    let implicitEnd = children || isInSeq ? start : Infinity;
    const timedChildren = children || [];
    for (let i = 0; i < timedChildren.length; i++) {
      const child = timedChildren[i];
      // In a sequential time container, a child begins when the previous one
      // ends.
      const childBegin = isSeq ? implicitEnd : start;
      // An anonymous span lasts as long as its parent, except in a sequential
      // time container.
      const childEnd = TXml.isText(child) ? (isSeq ? childBegin : Infinity) :
          this.resolveTiming_(/** @type {!shaka.extern.xml.Node} */ (child),
              rateInfo, childBegin, isSeq, intervals).end;
      implicitEnd = isSeq ? childEnd : Math.max(implicitEnd, childEnd);
    }

    let end = implicitEnd;
    if (explicitEnd != null && explicitDur != null) {
      end = Math.min(start + explicitDur, implicitBegin + explicitEnd);
    } else if (explicitDur != null) {
      end = start + explicitDur;
    } else if (explicitEnd != null) {
      end = implicitBegin + explicitEnd;
    }

    const interval = {start, end};
    intervals.set(element, interval);
    return interval;
  }

  /**
   * Gets the children of an element which take part in its timing, or null if
   * the element has no children for timing purposes.
   *
   * @param {!shaka.extern.xml.Node} element
   * @return {Array<!shaka.extern.xml.Node|string>}
   * @private
   */
  static getTimedChildren_(element) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const name = TtmlTextParser.getName_(element);
    // Text only becomes anonymous spans inside <p> and <span>.
    const hasText = name == 'p' || name == 'span';
    // Only content elements have children for timing purposes, unlike regions
    // for instance.
    const children = !hasText && name != 'body' && name != 'div' ? [] :
        element.children.filter((child) => TXml.isText(child) ? hasText :
            ['div', 'p', 'span', 'br', 'set'].includes(
                TtmlTextParser.getName_(child)));
    // A <span> with only text has no children, as its text is not an
    // anonymous span.
    if (!children.length ||
        (name == 'span' && children.every(TXml.isText))) {
      return null;
    }
    return children;
  }

  /**
   * @param {!shaka.extern.xml.Node|string} node
   * @return {boolean} True if the node is a content element: <div>, <p>, <span>
   *   or <br>.
   * @private
   */
  static isContentElement_(node) {
    return ['div', 'p', 'span', 'br'].includes(
        shaka.text.TtmlTextParser.getName_(node));
  }

  /**
   * @param {!shaka.extern.xml.Node|string} node
   * @return {string} The local name of the node if it is a TTML element, or an
   *   empty string otherwise.
   * @private
   */
  static getName_(node) {
    const TXml = shaka.util.TXml;
    if (TXml.isText(node)) {
      return '';
    }
    const element = /** @type {!shaka.extern.xml.Node} */ (node);
    const name = element.tagName.split(':').pop();
    return TXml.isElementNS(element, shaka.text.TtmlTextParser.ttmlNs_, name) ?
        name : '';
  }

  /**
   * @param {!shaka.extern.xml.Node} element
   * @return {boolean} True if the element is a sequential time container.
   * @private
   */
  static isSeqContainer_(element) {
    return element.attributes['timeContainer'] == 'seq';
  }

  /**
   * Parses a TTML time from the given attribute text.
   *
   * @param {string} text
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @return {?number}
   * @private
   */
  parseTimeAttribute_(text, rateInfo) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    if (!text) {
      return null;
    }

    // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
    let results = TtmlTextParser.timeColonFormatFrames_.exec(text);
    if (results) {
      const frames = Number(results[4]) +
          (Number(results[5]) || 0) / rateInfo.subFrameRate;
      return Number(results[3]) + frames / rateInfo.frameRate +
          (Number(results[2]) * 60) + (Number(results[1]) * 3600);
    }

    // 75f or 75.5f frames, or 50t or 50.5t ticks
    results = TtmlTextParser.timeFramesOrTicksFormat_.exec(text);
    if (results) {
      return Number(results[1]) /
          (results[2] == 'f' ? rateInfo.frameRate : rateInfo.tickRate);
    }

    results = TtmlTextParser.timeColonFormat_.exec(text) ||
        TtmlTextParser.timeHMSFormat_.exec(text);
    if (!results) {
      // It's not empty or null, but it doesn't match a known format.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          'Could not parse cue time range in TTML');
    }
    // The hours, minutes, seconds and milliseconds, after the whole match.
    // The optional captures are undefined, in which case they are 0.
    const time = (index) => Number(results[index]) || 0;
    return (time(4) / 1000) + time(3) + (time(2) * 60) + (time(1) * 3600);
  }

  /**
   * If ttp:cellResolution provided returns cell resolution info
   * with number of columns and rows into which the Root Container
   * Region area is divided
   *
   * @param {?string} cellResolution
   * @return {?{columns: number, rows: number}}
   * @private
   */
  getCellResolution_(cellResolution) {
    const matches = /^(\d+) (\d+)$/.exec(cellResolution || '');
    return matches ?
        {columns: Number(matches[1]), rows: Number(matches[2])} : null;
  }
};

/**
 * @summary
 * Contains information about frame/subframe rate
 * and frame rate multiplier for time in frame format.
 *
 * @example 01:02:03:04(4 frames) or 01:02:03:04.1(4 frames, 1 subframe)
 * @private
 */
shaka.text.TtmlTextParser.RateInfo_ = class {
  /**
   * @param {?string} frameRate
   * @param {?string} subFrameRate
   * @param {?string} frameRateMultiplier
   * @param {?string} tickRate
   */
  constructor(frameRate, subFrameRate, frameRateMultiplier, tickRate) {
    /**
     * @type {number}
     */
    this.frameRate = Number(frameRate) || 30;

    /**
     * @type {number}
     */
    this.subFrameRate = Number(subFrameRate) || 1;

    /**
     * @type {number}
     */
    this.tickRate = Number(tickRate) ||
        (frameRate ? this.frameRate * this.subFrameRate : 1);

    const multiplierResults = /^(\d+) (\d+)$/.exec(frameRateMultiplier || '');
    if (multiplierResults) {
      this.frameRate *=
          Number(multiplierResults[1]) / Number(multiplierResults[2]);
    }
  }
};

/**
 * The interval during which an element is active, in seconds.  An infinite
 * end means that the duration is indefinite.
 *
 * @typedef {{
 *   start: number,
 *   end: number,
 * }}
 */
shaka.text.TtmlTextParser.Interval_;

/**
 * The intervals of the elements of a document.
 *
 * @typedef {!Map<!shaka.extern.xml.Node, shaka.text.TtmlTextParser.Interval_>}
 */
shaka.text.TtmlTextParser.Intervals_;

/**
 * Matches no color, and fully transparent colors.
 *
 * @const
 * @private {!RegExp}
 * @example transparent, #ff000000 or rgba(255,0,0,0)
 */
shaka.text.TtmlTextParser.transparentColor_ =
    /^(transparent|#\w{6}00|rgba\(.*,\s*0\))?$/i;

/**
 * Lengths relative to the width and the height of the root container are
 * percentages too.
 *
 * @const
 * @private {!RegExp}
 * @example 50.17% 10% or 50rw 10rh
 */
shaka.text.TtmlTextParser.percentValues_ = new RegExp(
    '^(\\d{1,2}(?:\\.\\d+)?|100(?:\\.0+)?)(?:%|rw) ' +
    '(\\d{1,2}(?:\\.\\d+)?|100(?:\\.0+)?)(?:%|rh)$');

/**
 * @const
 * @private {!RegExp}
 * @example 0.6% 90% 300% 1000%
 */
shaka.text.TtmlTextParser.percentValue_ = /^(\d{1,4}(?:\.\d+)?|100)%$/;

/**
 * @const
 * @private {!RegExp}
 * @example 100px, 8em, 0.80c
 */
shaka.text.TtmlTextParser.unitValues_ = /^(\d+px|\d+em|\d*\.?\d+c)$/;

/**
 * @const
 * @private {!RegExp}
 * @example 100px
 */
shaka.text.TtmlTextParser.pixelValues_ = /^(\d+)px (\d+)px$/;

/**
 * @const
 * @private {!RegExp}
 * @example 00:00:40:07 (7 frames) or 00:00:40:07.1 (7 frames, 1 subframe)
 */
shaka.text.TtmlTextParser.timeColonFormatFrames_ =
    /^(\d{2,}):(\d{2}):(\d{2}):(\d{2})\.?(\d+)?$/;

/**
 * @const
 * @private {!RegExp}
 * @example 00:00:40, 00:40, 01:02:43.0345555, 02:43.03 or 02:45.5
 */
shaka.text.TtmlTextParser.timeColonFormat_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}(?:\.\d+)?)$/;

/**
 * @const
 * @private {!RegExp}
 * @example 75f or 75.5f frames, or 50t or 50.5t ticks
 */
shaka.text.TtmlTextParser.timeFramesOrTicksFormat_ = /^(\d*(?:\.\d*)?)([ft])$/;

/**
 * @const
 * @private {!RegExp}
 * @example 3.45h, 3m, 4.20s or 500ms
 */
shaka.text.TtmlTextParser.timeHMSFormat_ =
    new RegExp(['^(?:(\\d*(?:\\.\\d*)?)h)?',
      '(?:(\\d*(?:\\.\\d*)?)m(?!s))?',
      '(?:(\\d*(?:\\.\\d*)?)s)?',
      '(?:(\\d*(?:\\.\\d*)?)ms)?$'].join(''));

/**
 * The font families of the generic TTML font families.
 *
 * @const {!Object<string, string>}
 * @private
 */
shaka.text.TtmlTextParser.genericFontFamilies_ = {
  'monospaceSerif': 'Courier New,Liberation Mono,Courier,monospace',
  'proportionalSansSerif': 'Arial,Helvetica,Liberation Sans,sans-serif',
  'sansSerif': 'sans-serif',
  // cspell: disable-next-line
  'monospaceSansSerif': 'Consolas,monospace',
  'proportionalSerif': 'serif',
};

/**
 * The text decorations, by their lower case TTML name.
 *
 * @const {!Object<string, shaka.text.Cue.textDecoration>}
 * @private
 */
shaka.text.TtmlTextParser.textDecorations_ = {
  'underline': shaka.text.Cue.textDecoration.UNDERLINE,
  // cspell: disable-next-line
  'linethrough': shaka.text.Cue.textDecoration.LINE_THROUGH,
  'overline': shaka.text.Cue.textDecoration.OVERLINE,
};

/**
 * The position alignment and the line alignment of each text alignment.
 *
 * @const {!Object<string, !Array<?>>}
 * @private
 */
shaka.text.TtmlTextParser.textAlignments_ = {
  'left': [shaka.text.Cue.positionAlign.LEFT, shaka.text.Cue.lineAlign.START],
  'center':
      [shaka.text.Cue.positionAlign.CENTER, shaka.text.Cue.lineAlign.CENTER],
  'right': [shaka.text.Cue.positionAlign.RIGHT, shaka.text.Cue.lineAlign.END],
  'start': [shaka.text.Cue.positionAlign.LEFT, shaka.text.Cue.lineAlign.START],
  'end': [shaka.text.Cue.positionAlign.RIGHT, shaka.text.Cue.lineAlign.END],
};

/**
 * Supported TTML element namespaces. The empty namespace preserves support for
 * legacy documents that omit namespace declarations.
 * @const {!Array<string>}
 * @private
 */
shaka.text.TtmlTextParser.ttmlNs_ = [
  'http://www.w3.org/ns/ttml',
  'http://www.w3.org/2006/10/ttaf1',
  '',
];

/**
 * The namespace URL for TTML parameters.  Can be assigned any name in the TTML
 * document, not just "ttp:", so we use this with getAttributeNS() to ensure
 * that we support arbitrary namespace names.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.text.TtmlTextParser.parameterNs_ = [
  'http://www.w3.org/ns/ttml#parameter',
  'http://www.w3.org/2006/10/ttaf1#parameter',
];

/**
 * The namespace URL for TTML styles.  Can be assigned any name in the TTML
 * document, not just "tts:", so we use this with getAttributeNS() to ensure
 * that we support arbitrary namespace names.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.text.TtmlTextParser.styleNs_ = [
  'http://www.w3.org/ns/ttml#styling',
  'http://www.w3.org/2006/10/ttaf1#styling',
];

/**
 * The namespace URL for EBU TTML styles.  Can be assigned any name in the TTML
 * document, not just "ebutts:", so we use this with getAttributeNS() to ensure
 * that we support arbitrary namespace names.
 *
 * @const {string}
 * @private
 */
shaka.text.TtmlTextParser.styleEbuttsNs_ = 'urn:ebu:tt:style';

/**
 * The supported namespace URLs for SMPTE fields.
 * @const {!Array<string>}
 * @private
 */
shaka.text.TtmlTextParser.smpteNsList_ = [
  'http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt',
  'http://www.smpte-ra.org/schemas/2052-1/2013/smpte-tt',
];

shaka.text.TextEngine.registerParser(
    'application/ttml+xml', () => new shaka.text.TtmlTextParser());
