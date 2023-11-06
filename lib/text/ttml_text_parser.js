/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.TtmlTextParser');

goog.require('goog.asserts');
goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.XmlUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.TtmlTextParser = class {
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
  setSequenceMode(sequenceMode) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const XmlUtils = shaka.util.XmlUtils;
    const ttpNs = TtmlTextParser.parameterNs_;
    const ttsNs = TtmlTextParser.styleNs_;
    const str = shaka.util.StringUtils.fromUTF8(data);
    const cues = [];

    // dont try to parse empty string as
    // DOMParser will not throw error but return an errored xml
    if (str == '') {
      return cues;
    }

    const tt = XmlUtils.parseXmlString(str, 'tt');
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Failed to parse TTML.');
    }

    const body = tt.getElementsByTagName('body')[0];
    if (!body) {
      return [];
    }

    // Get the framerate, subFrameRate and frameRateMultiplier if applicable.
    const frameRate = XmlUtils.getAttributeNSList(tt, ttpNs, 'frameRate');
    const subFrameRate = XmlUtils.getAttributeNSList(
        tt, ttpNs, 'subFrameRate');
    const frameRateMultiplier =
        XmlUtils.getAttributeNSList(tt, ttpNs, 'frameRateMultiplier');
    const tickRate = XmlUtils.getAttributeNSList(tt, ttpNs, 'tickRate');

    const cellResolution = XmlUtils.getAttributeNSList(
        tt, ttpNs, 'cellResolution');
    const spaceStyle = tt.getAttribute('xml:space') || 'default';
    const extent = XmlUtils.getAttributeNSList(tt, ttsNs, 'extent');

    if (spaceStyle != 'default' && spaceStyle != 'preserve') {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Invalid xml:space value: ' + spaceStyle);
    }
    const whitespaceTrim = spaceStyle == 'default';

    const rateInfo = new TtmlTextParser.RateInfo_(
        frameRate, subFrameRate, frameRateMultiplier, tickRate);

    const cellResolutionInfo =
      TtmlTextParser.getCellResolution_(cellResolution);

    const metadata = tt.getElementsByTagName('metadata')[0];
    const metadataElements = metadata ? XmlUtils.getChildren(metadata) : [];
    const styles = Array.from(tt.getElementsByTagName('style'));
    const regionElements = Array.from(tt.getElementsByTagName('region'));

    const cueRegions = [];
    for (const region of regionElements) {
      const cueRegion =
          TtmlTextParser.parseCueRegion_(region, styles, extent);
      if (cueRegion) {
        cueRegions.push(cueRegion);
      }
    }

    // A <body> element should only contain <div> elements, not <p> or <span>
    // elements.  We used to allow this, but it is non-compliant, and the
    // loose nature of our previous parser made it difficult to implement TTML
    // nesting more fully.
    if (XmlUtils.findChildren(body, 'p').length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          '<p> can only be inside <div> in TTML');
    }

    for (const div of XmlUtils.findChildren(body, 'div')) {
      // A <div> element should only contain <p>, not <span>.
      if (XmlUtils.findChildren(div, 'span').length) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_TEXT_CUE,
            '<span> can only be inside <p> in TTML');
      }
    }

    const cue = TtmlTextParser.parseCue_(
        body, time, rateInfo, metadataElements, styles,
        regionElements, cueRegions, whitespaceTrim,
        cellResolutionInfo, /* parentCueElement= */ null,
        /* isContent= */ false, uri);
    if (cue) {
      // According to the TTML spec, backgrounds default to transparent.
      // So default the background of the top-level element to transparent.
      // Nested elements may override that background color already.
      if (!cue.backgroundColor) {
        cue.backgroundColor = 'transparent';
      }
      cues.push(cue);
    }

    return cues;
  }

  /**
   * Parses a TTML node into a Cue.
   *
   * @param {!Node} cueNode
   * @param {shaka.extern.TextParser.TimeContext} timeContext
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {!Array.<!Element>} metadataElements
   * @param {!Array.<!Element>} styles
   * @param {!Array.<!Element>} regionElements
   * @param {!Array.<!shaka.text.CueRegion>} cueRegions
   * @param {boolean} whitespaceTrim
   * @param {?{columns: number, rows: number}} cellResolution
   * @param {?Element} parentCueElement
   * @param {boolean} isContent
   * @param {?(string|undefined)} uri
   * @return {shaka.text.Cue}
   * @private
   */
  static parseCue_(
      cueNode, timeContext, rateInfo, metadataElements, styles, regionElements,
      cueRegions, whitespaceTrim, cellResolution, parentCueElement, isContent,
      uri) {
    /** @type {Element} */
    let cueElement;
    /** @type {Element} */
    let parentElement = /** @type {Element} */ (cueNode.parentNode);

    if (cueNode.nodeType == Node.COMMENT_NODE) {
      // The comments do not contain information that interests us here.
      return null;
    }

    if (cueNode.nodeType == Node.TEXT_NODE) {
      if (!isContent) {
        // Ignore text elements outside the content. For example, whitespace
        // on the same lexical level as the <p> elements, in a document with
        // xml:space="preserve", should not be renderer.
        return null;
      }
      // This should generate an "anonymous span" according to the TTML spec.
      // So pretend the element was a <span>.  parentElement was set above, so
      // we should still be able to correctly traverse up for timing
      // information later.
      const span = document.createElement('span');
      span.textContent = cueNode.textContent;
      cueElement = span;
    } else {
      goog.asserts.assert(cueNode.nodeType == Node.ELEMENT_NODE,
          'nodeType should be ELEMENT_NODE!');
      cueElement = /** @type {!Element} */(cueNode);
    }
    goog.asserts.assert(cueElement, 'cueElement should be non-null!');

    let imageElement = null;
    for (const nameSpace of shaka.text.TtmlTextParser.smpteNsList_) {
      imageElement = shaka.text.TtmlTextParser.getElementsFromCollection_(
          cueElement, 'backgroundImage', metadataElements, '#',
          nameSpace)[0];
      if (imageElement) {
        break;
      }
    }

    let imageUri = null;
    const backgroundImage = shaka.util.XmlUtils.getAttributeNSList(
        cueElement,
        shaka.text.TtmlTextParser.smpteNsList_,
        'backgroundImage');
    if (uri && backgroundImage && !backgroundImage.startsWith('#')) {
      const baseUri = new goog.Uri(uri);
      const relativeUri = new goog.Uri(backgroundImage);
      const newUri = baseUri.resolve(relativeUri).toString();
      if (newUri) {
        imageUri = newUri;
      }
    }

    if (cueNode.nodeName == 'p' || imageElement || imageUri) {
      isContent = true;
    }

    const parentIsContent = isContent;

    const spaceStyle = cueElement.getAttribute('xml:space') ||
        (whitespaceTrim ? 'default' : 'preserve');

    const localWhitespaceTrim = spaceStyle == 'default';

    // Parse any nested cues first.
    const isTextNode = (node) => {
      return node.nodeType == Node.TEXT_NODE;
    };
    const isLeafNode = Array.from(cueElement.childNodes).every(isTextNode);
    const nestedCues = [];
    if (!isLeafNode) {
      // Otherwise, recurse into the children.  Text nodes will convert into
      // anonymous spans, which will then be leaf nodes.
      for (const childNode of cueElement.childNodes) {
        const nestedCue = shaka.text.TtmlTextParser.parseCue_(
            childNode,
            timeContext,
            rateInfo,
            metadataElements,
            styles,
            regionElements,
            cueRegions,
            localWhitespaceTrim,
            cellResolution,
            cueElement,
            isContent,
            uri,
        );

        // This node may or may not generate a nested cue.
        if (nestedCue) {
          nestedCues.push(nestedCue);
        }
      }
    }

    const isNested = /** @type {boolean} */ (parentCueElement != null);

    // In this regex, "\S" means "non-whitespace character".
    const hasTextContent = /\S/.test(cueElement.textContent);
    const hasTimeAttributes =
        cueElement.hasAttribute('begin') ||
        cueElement.hasAttribute('end') ||
        cueElement.hasAttribute('dur');

    if (!hasTimeAttributes && !hasTextContent && cueElement.tagName != 'br' &&
        nestedCues.length == 0) {
      if (!isNested) {
        // Disregards empty <p> elements without time attributes nor content.
        // <p begin="..." smpte:backgroundImage="..." /> will go through,
        // as some information could be held by its attributes.
        // <p /> won't, as it would not be displayed.
        return null;
      } else if (localWhitespaceTrim) {
        // Disregards empty anonymous spans when (local) trim is true.
        return null;
      }
    }

    // Get local time attributes.
    let {start, end} = shaka.text.TtmlTextParser.parseTime_(
        cueElement, rateInfo);
    // Resolve local time relative to parent elements.  Time elements can appear
    // all the way up to 'body', but not 'tt'.
    while (parentElement && parentElement.nodeType == Node.ELEMENT_NODE &&
        parentElement.tagName != 'tt') {
      ({start, end} = shaka.text.TtmlTextParser.resolveTime_(
          parentElement, rateInfo, start, end));
      parentElement = /** @type {Element} */(parentElement.parentNode);
    }

    if (start == null) {
      start = 0;
    }
    start += timeContext.periodStart;

    // If end is null, that means the duration is effectively infinite.
    if (end == null) {
      end = Infinity;
    } else {
      end += timeContext.periodStart;
    }

    // Clip times to segment boundaries.
    // https://github.com/shaka-project/shaka-player/issues/4631
    start = Math.max(start, timeContext.segmentStart);
    end = Math.min(end, timeContext.segmentEnd);

    if (!hasTimeAttributes && nestedCues.length > 0) {
      // If no time is defined for this cue, base the timing information on
      // the time of the nested cues. In the case of multiple nested cues with
      // different start times, it is the text displayer's responsibility to
      // make sure that only the appropriate nested cue is drawn at any given
      // time.
      start = Infinity;
      end = 0;
      for (const cue of nestedCues) {
        start = Math.min(start, cue.startTime);
        end = Math.max(end, cue.endTime);
      }
    }

    if (cueElement.tagName == 'br') {
      const cue = new shaka.text.Cue(start, end, '');
      cue.lineBreak = true;
      return cue;
    }

    let payload = '';
    if (isLeafNode) {
      // If the childNodes are all text, this is a leaf node.  Get the payload.
      payload = cueElement.textContent;
      if (localWhitespaceTrim) {
        // Trim leading and trailing whitespace.
        payload = payload.trim();
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

    // Get other properties if available.
    const regionElement = shaka.text.TtmlTextParser.getElementsFromCollection_(
        cueElement, 'region', regionElements, /* prefix= */ '')[0];
    // Do not actually apply that region unless it is non-inherited, though.
    // This makes it so that, if a parent element has a region, the children
    // don't also all independently apply the positioning of that region.
    if (cueElement.hasAttribute('region')) {
      if (regionElement && regionElement.getAttribute('xml:id')) {
        const regionId = regionElement.getAttribute('xml:id');
        cue.region = cueRegions.filter((region) => region.id == regionId)[0];
      }
    }

    let regionElementForStyle = regionElement;
    if (parentCueElement && isNested && !cueElement.getAttribute('region') &&
      !cueElement.getAttribute('style')) {
      regionElementForStyle =
          shaka.text.TtmlTextParser.getElementsFromCollection_(
              parentCueElement, 'region', regionElements, /* prefix= */ '')[0];
    }

    shaka.text.TtmlTextParser.addStyle_(
        cue,
        cueElement,
        regionElementForStyle,
        imageElement,
        imageUri,
        styles,
        /** isNested= */ parentIsContent, // "nested in a <div>" doesn't count.
        /** isLeaf= */ (nestedCues.length == 0));

    return cue;
  }

  /**
   * Parses an Element into a TextTrackCue or VTTCue.
   *
   * @param {!Element} regionElement
   * @param {!Array.<!Element>} styles Defined in the top of tt  element and
   * used principally for images.
   * @param {?string} globalExtent
   * @return {shaka.text.CueRegion}
   * @private
   */
  static parseCueRegion_(regionElement, styles, globalExtent) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const region = new shaka.text.CueRegion();
    const id = regionElement.getAttribute('xml:id');
    if (!id) {
      shaka.log.warning('TtmlTextParser parser encountered a region with ' +
                        'no id. Region will be ignored.');
      return null;
    }
    region.id = id;

    let globalResults = null;
    if (globalExtent) {
      globalResults = TtmlTextParser.percentValues_.exec(globalExtent) ||
        TtmlTextParser.pixelValues_.exec(globalExtent);
    }
    const globalWidth = globalResults ? Number(globalResults[1]) : null;
    const globalHeight = globalResults ? Number(globalResults[2]) : null;

    let results = null;
    let percentage = null;
    const extent = TtmlTextParser.getStyleAttributeFromRegion_(
        regionElement, styles, 'extent');
    if (extent) {
      percentage = TtmlTextParser.percentValues_.exec(extent);
      results = percentage || TtmlTextParser.pixelValues_.exec(extent);
      if (results != null) {
        region.width = Number(results[1]);
        region.height = Number(results[2]);

        if (!percentage) {
          if (globalWidth != null) {
            region.width = region.width * 100 / globalWidth;
          }
          if (globalHeight != null) {
            region.height = region.height * 100 / globalHeight;
          }
        }

        region.widthUnits = percentage || globalWidth != null ?
                           shaka.text.CueRegion.units.PERCENTAGE :
                           shaka.text.CueRegion.units.PX;

        region.heightUnits = percentage || globalHeight != null ?
                           shaka.text.CueRegion.units.PERCENTAGE :
                           shaka.text.CueRegion.units.PX;
      }
    }

    const origin = TtmlTextParser.getStyleAttributeFromRegion_(
        regionElement, styles, 'origin');
    if (origin) {
      percentage = TtmlTextParser.percentValues_.exec(origin);
      results = percentage || TtmlTextParser.pixelValues_.exec(origin);
      if (results != null) {
        region.viewportAnchorX = Number(results[1]);
        region.viewportAnchorY = Number(results[2]);

        if (!percentage) {
          if (globalHeight != null) {
            region.viewportAnchorY = region.viewportAnchorY * 100 /
              globalHeight;
          }
          if (globalWidth != null) {
            region.viewportAnchorX = region.viewportAnchorX * 100 /
              globalWidth;
          }
        }

        region.viewportAnchorUnits = percentage || globalWidth != null ?
                  shaka.text.CueRegion.units.PERCENTAGE :
                  shaka.text.CueRegion.units.PX;
      }
    }

    return region;
  }

  /**
   * Adds applicable style properties to a cue.
   *
   * @param {!shaka.text.Cue} cue
   * @param {!Element} cueElement
   * @param {Element} region
   * @param {Element} imageElement
   * @param {?string} imageUri
   * @param {!Array.<!Element>} styles
   * @param {boolean} isNested
   * @param {boolean} isLeaf
   * @private
   */
  static addStyle_(
      cue, cueElement, region, imageElement, imageUri, styles,
      isNested, isLeaf) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const Cue = shaka.text.Cue;

    // Styles should be inherited from regions, if a style property is not
    // associated with a Content element (or an anonymous span).
    const shouldInheritRegionStyles = isNested || isLeaf;

    const direction = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'direction', shouldInheritRegionStyles);
    if (direction == 'rtl') {
      cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    }

    // Direction attribute specifies one-dimentional writing direction
    // (left to right or right to left). Writing mode specifies that
    // plus whether text is vertical or horizontal.
    // They should not contradict each other. If they do, we give
    // preference to writing mode.
    const writingMode = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'writingMode', shouldInheritRegionStyles);
    // Set cue's direction if the text is horizontal, and cue's writingMode if
    // it's vertical.
    if (writingMode == 'tb' || writingMode == 'tblr') {
      cue.writingMode = Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    } else if (writingMode == 'tbrl') {
      cue.writingMode = Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    } else if (writingMode == 'rltb' || writingMode == 'rl') {
      cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    } else if (writingMode) {
      cue.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;
    }

    const align = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'textAlign', true);
    if (align) {
      cue.positionAlign = TtmlTextParser.textAlignToPositionAlign_[align];
      cue.lineAlign = TtmlTextParser.textAlignToLineAlign_[align];

      goog.asserts.assert(align.toUpperCase() in Cue.textAlign,
          align.toUpperCase() + ' Should be in Cue.textAlign values!');

      cue.textAlign = Cue.textAlign[align.toUpperCase()];
    } else {
      // Default value is START in the TTML spec: https://bit.ly/32OGmvo
      // But to make the subtitle render consitent with other players and the
      // shaka.text.Cue we use CENTER
      cue.textAlign = Cue.textAlign.CENTER;
    }

    const displayAlign = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'displayAlign', true);
    if (displayAlign) {
      goog.asserts.assert(displayAlign.toUpperCase() in Cue.displayAlign,
          displayAlign.toUpperCase() +
                          ' Should be in Cue.displayAlign values!');
      cue.displayAlign = Cue.displayAlign[displayAlign.toUpperCase()];
    }

    const color = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'color', shouldInheritRegionStyles);
    if (color) {
      cue.color = color;
    }

    // Background color should not be set on a container.  If this is a nested
    // cue, you can set the background.  If it's a top-level that happens to
    // also be a leaf, you can set the background.
    // See https://github.com/shaka-project/shaka-player/issues/2623
    // This used to be handled in the displayer, but that is confusing.  The Cue
    // structure should reflect what you want to happen in the displayer, and
    // the displayer shouldn't have to know about TTML.
    const backgroundColor = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'backgroundColor',
        shouldInheritRegionStyles);
    if (backgroundColor) {
      cue.backgroundColor = backgroundColor;
    }

    const border = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'border', shouldInheritRegionStyles);
    if (border) {
      cue.border = border;
    }

    const fontFamily = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'fontFamily', shouldInheritRegionStyles);
    // See https://github.com/sandflow/imscJS/blob/1.1.3/src/main/js/html.js#L1384
    if (fontFamily) {
      switch (fontFamily) {
        case 'monospaceSerif':
          cue.fontFamily = 'Courier New,Liberation Mono,Courier,monospace';
          break;
        case 'proportionalSansSerif':
          cue.fontFamily = 'Arial,Helvetica,Liberation Sans,sans-serif';
          break;
        case 'sansSerif':
          cue.fontFamily = 'sans-serif';
          break;
        case 'monospaceSansSerif':
          cue.fontFamily = 'Consolas,monospace';
          break;
        case 'proportionalSerif':
          cue.fontFamily = 'serif';
          break;
        default:
          cue.fontFamily = fontFamily;
          break;
      }
    }

    const fontWeight = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'fontWeight', shouldInheritRegionStyles);
    if (fontWeight && fontWeight == 'bold') {
      cue.fontWeight = Cue.fontWeight.BOLD;
    }

    const wrapOption = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'wrapOption', shouldInheritRegionStyles);
    if (wrapOption && wrapOption == 'noWrap') {
      cue.wrapLine = false;
    } else {
      cue.wrapLine = true;
    }

    const lineHeight = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'lineHeight', shouldInheritRegionStyles);
    if (lineHeight && lineHeight.match(TtmlTextParser.unitValues_)) {
      cue.lineHeight = lineHeight;
    }

    const fontSize = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'fontSize', shouldInheritRegionStyles);
    if (fontSize) {
      const isValidFontSizeUnit =
          fontSize.match(TtmlTextParser.unitValues_) ||
          fontSize.match(TtmlTextParser.percentValue_);

      if (isValidFontSizeUnit) {
        cue.fontSize = fontSize;
      }
    }

    const fontStyle = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'fontStyle', shouldInheritRegionStyles);
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
          imageElement.getAttribute('imageType') ||
          imageElement.getAttribute('imagetype');
      const backgroundImageEncoding = imageElement.getAttribute('encoding');
      const backgroundImageData = imageElement.textContent.trim();
      if (backgroundImageType == 'PNG' &&
          backgroundImageEncoding == 'Base64' &&
          backgroundImageData) {
        cue.backgroundImage = 'data:image/png;base64,' + backgroundImageData;
      }
    } else if (imageUri) {
      cue.backgroundImage = imageUri;
    }

    const textOutline = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'textOutline', shouldInheritRegionStyles);
    if (textOutline) {
      // tts:textOutline isn't natively supported by browsers, but it can be
      // mostly replicated using the non-standard -webkit-text-stroke-width and
      // -webkit-text-stroke-color properties.
      const split = textOutline.split(' ');
      if (split[0].match(TtmlTextParser.unitValues_)) {
        // There is no defined color, so default to the text color.
        cue.textStrokeColor = cue.color;
      } else {
        cue.textStrokeColor = split[0];
        split.shift();
      }
      if (split[0] && split[0].match(TtmlTextParser.unitValues_)) {
        cue.textStrokeWidth = split[0];
      } else {
        // If there is no width, or the width is not a number, don't draw a
        // border.
        cue.textStrokeColor = '';
      }
      // There is an optional blur radius also, but we have no way of
      // replicating that, so ignore it.
    }

    const letterSpacing = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'letterSpacing', shouldInheritRegionStyles);
    if (letterSpacing && letterSpacing.match(TtmlTextParser.unitValues_)) {
      cue.letterSpacing = letterSpacing;
    }

    const linePadding = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'linePadding', shouldInheritRegionStyles);
    if (linePadding && linePadding.match(TtmlTextParser.unitValues_)) {
      cue.linePadding = linePadding;
    }

    const opacity = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'opacity', shouldInheritRegionStyles);
    if (opacity) {
      cue.opacity = parseFloat(opacity);
    }

    // Text decoration is an array of values which can come both from the
    // element's style or be inherited from elements' parent nodes. All of those
    // values should be applied as long as they don't contradict each other. If
    // they do, elements' own style gets preference.
    const textDecorationRegion = TtmlTextParser.getStyleAttributeFromRegion_(
        region, styles, 'textDecoration');
    if (textDecorationRegion) {
      TtmlTextParser.addTextDecoration_(cue, textDecorationRegion);
    }

    const textDecorationElement = TtmlTextParser.getStyleAttributeFromElement_(
        cueElement, styles, 'textDecoration');
    if (textDecorationElement) {
      TtmlTextParser.addTextDecoration_(cue, textDecorationElement);
    }

    const textCombine = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'textCombine', shouldInheritRegionStyles);
    if (textCombine) {
      cue.textCombineUpright = textCombine;
    }

    const ruby = TtmlTextParser.getStyleAttribute_(
        cueElement, region, styles, 'ruby', shouldInheritRegionStyles);
    switch (ruby) {
      case 'container':
        cue.rubyTag = 'ruby';
        break;
      case 'text':
        cue.rubyTag = 'rt';
        break;
    }
  }

  /**
   * Parses text decoration values and adds/removes them to/from the cue.
   *
   * @param {!shaka.text.Cue} cue
   * @param {string} decoration
   * @private
   */
  static addTextDecoration_(cue, decoration) {
    const Cue = shaka.text.Cue;
    for (const value of decoration.split(' ')) {
      switch (value) {
        case 'underline':
          if (!cue.textDecoration.includes(Cue.textDecoration.UNDERLINE)) {
            cue.textDecoration.push(Cue.textDecoration.UNDERLINE);
          }
          break;
        case 'noUnderline':
          if (cue.textDecoration.includes(Cue.textDecoration.UNDERLINE)) {
            shaka.util.ArrayUtils.remove(cue.textDecoration,
                Cue.textDecoration.UNDERLINE);
          }
          break;
        case 'lineThrough':
          if (!cue.textDecoration.includes(Cue.textDecoration.LINE_THROUGH)) {
            cue.textDecoration.push(Cue.textDecoration.LINE_THROUGH);
          }
          break;
        case 'noLineThrough':
          if (cue.textDecoration.includes(Cue.textDecoration.LINE_THROUGH)) {
            shaka.util.ArrayUtils.remove(cue.textDecoration,
                Cue.textDecoration.LINE_THROUGH);
          }
          break;
        case 'overline':
          if (!cue.textDecoration.includes(Cue.textDecoration.OVERLINE)) {
            cue.textDecoration.push(Cue.textDecoration.OVERLINE);
          }
          break;
        case 'noOverline':
          if (cue.textDecoration.includes(Cue.textDecoration.OVERLINE)) {
            shaka.util.ArrayUtils.remove(cue.textDecoration,
                Cue.textDecoration.OVERLINE);
          }
          break;
      }
    }
  }

  /**
   * Finds a specified attribute on either the original cue element or its
   * associated region and returns the value if the attribute was found.
   *
   * @param {!Element} cueElement
   * @param {Element} region
   * @param {!Array.<!Element>} styles
   * @param {string} attribute
   * @param {boolean=} shouldInheritRegionStyles
   * @return {?string}
   * @private
   */
  static getStyleAttribute_(cueElement, region, styles, attribute,
      shouldInheritRegionStyles=true) {
    // An attribute can be specified on region level or in a styling block
    // associated with the region or original element.
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const attr = TtmlTextParser.getStyleAttributeFromElement_(
        cueElement, styles, attribute);
    if (attr) {
      return attr;
    }

    if (shouldInheritRegionStyles) {
      return TtmlTextParser.getStyleAttributeFromRegion_(
          region, styles, attribute);
    }
    return null;
  }

  /**
   * Finds a specified attribute on the element's associated region
   * and returns the value if the attribute was found.
   *
   * @param {Element} region
   * @param {!Array.<!Element>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  static getStyleAttributeFromRegion_(region, styles, attribute) {
    const XmlUtils = shaka.util.XmlUtils;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;

    if (!region) {
      return null;
    }

    const attr = XmlUtils.getAttributeNSList(region, ttsNs, attribute);
    if (attr) {
      return attr;
    }

    return shaka.text.TtmlTextParser.getInheritedStyleAttribute_(
        region, styles, attribute);
  }

  /**
   * Finds a specified attribute on the cue element and returns the value
   * if the attribute was found.
   *
   * @param {!Element} cueElement
   * @param {!Array.<!Element>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  static getStyleAttributeFromElement_(cueElement, styles, attribute) {
    const XmlUtils = shaka.util.XmlUtils;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;

    // Styling on elements should take precedence
    // over the main styling attributes
    const elementAttribute = XmlUtils.getAttributeNSList(
        cueElement,
        ttsNs,
        attribute);

    if (elementAttribute) {
      return elementAttribute;
    }
    return shaka.text.TtmlTextParser.getInheritedStyleAttribute_(
        cueElement, styles, attribute);
  }

  /**
   * Finds a specified attribute on an element's styles and the styles those
   * styles inherit from.
   *
   * @param {!Element} element
   * @param {!Array.<!Element>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  static getInheritedStyleAttribute_(element, styles, attribute) {
    const XmlUtils = shaka.util.XmlUtils;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;
    const ebuttsNs = shaka.text.TtmlTextParser.styleEbuttsNs_;

    const inheritedStyles =
        shaka.text.TtmlTextParser.getElementsFromCollection_(
            element, 'style', styles, /* prefix= */ '');

    let styleValue = null;

    // The last value in our styles stack takes the precedence over the others
    for (let i = 0; i < inheritedStyles.length; i++) {
      // Check ebu namespace first.
      let styleAttributeValue = XmlUtils.getAttributeNS(
          inheritedStyles[i],
          ebuttsNs,
          attribute);

      if (!styleAttributeValue) {
        // Fall back to tts namespace.
        styleAttributeValue = XmlUtils.getAttributeNSList(
            inheritedStyles[i],
            ttsNs,
            attribute);
      }

      if (!styleAttributeValue) {
        // Next, check inheritance.
        // Styles can inherit from other styles, so traverse up that chain.
        styleAttributeValue =
            shaka.text.TtmlTextParser.getStyleAttributeFromElement_(
                inheritedStyles[i], styles, attribute);
      }

      if (styleAttributeValue) {
        styleValue = styleAttributeValue;
      }
    }

    return styleValue;
  }


  /**
   * Selects items from |collection| whose id matches |attributeName|
   * from |element|.
   *
   * @param {Element} element
   * @param {string} attributeName
   * @param {!Array.<Element>} collection
   * @param {string} prefixName
   * @param {string=} nsName
   * @return {!Array.<!Element>}
   * @private
   */
  static getElementsFromCollection_(
      element, attributeName, collection, prefixName, nsName) {
    const items = [];

    if (!element || collection.length < 1) {
      return items;
    }

    const attributeValue = shaka.text.TtmlTextParser.getInheritedAttribute_(
        element, attributeName, nsName);

    if (attributeValue) {
      // There could be multiple items in one attribute
      // <span style="style1 style2">A cue</span>
      const itemNames = attributeValue.split(' ');

      for (const name of itemNames) {
        for (const item of collection) {
          if ((prefixName + item.getAttribute('xml:id')) == name) {
            items.push(item);
            break;
          }
        }
      }
    }

    return items;
  }


  /**
   * Traverses upwards from a given node until a given attribute is found.
   *
   * @param {!Element} element
   * @param {string} attributeName
   * @param {string=} nsName
   * @return {?string}
   * @private
   */
  static getInheritedAttribute_(element, attributeName, nsName) {
    let ret = null;
    const XmlUtils = shaka.util.XmlUtils;
    while (element) {
      ret = nsName ?
          XmlUtils.getAttributeNS(element, nsName, attributeName) :
          element.getAttribute(attributeName);
      if (ret) {
        break;
      }

      // Element.parentNode can lead to XMLDocument, which is not an Element and
      // has no getAttribute().
      const parentNode = element.parentNode;
      if (parentNode instanceof Element) {
        element = parentNode;
      } else {
        break;
      }
    }
    return ret;
  }

  /**
   * Factor parent/ancestor time attributes into the parsed time of a
   * child/descendent.
   *
   * @param {!Element} parentElement
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {?number} start The child's start time
   * @param {?number} end The child's end time
   * @return {{start: ?number, end: ?number}}
   * @private
   */
  static resolveTime_(parentElement, rateInfo, start, end) {
    const parentTime = shaka.text.TtmlTextParser.parseTime_(
        parentElement, rateInfo);

    if (start == null) {
      // No start time of your own?  Inherit from the parent.
      start = parentTime.start;
    } else {
      // Otherwise, the start time is relative to the parent's start time.
      if (parentTime.start != null) {
        start += parentTime.start;
      }
    }

    if (end == null) {
      // No end time of your own?  Inherit from the parent.
      end = parentTime.end;
    } else {
      // Otherwise, the end time is relative to the parent's _start_ time.
      // This is not a typo.  Both times are relative to the parent's _start_.
      if (parentTime.start != null) {
        end += parentTime.start;
      }
    }

    return {start, end};
  }

  /**
   * Parse TTML time attributes from the given element.
   *
   * @param {!Element} element
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @return {{start: ?number, end: ?number}}
   * @private
   */
  static parseTime_(element, rateInfo) {
    const start = shaka.text.TtmlTextParser.parseTimeAttribute_(
        element.getAttribute('begin'), rateInfo);
    let end = shaka.text.TtmlTextParser.parseTimeAttribute_(
        element.getAttribute('end'), rateInfo);
    const duration = shaka.text.TtmlTextParser.parseTimeAttribute_(
        element.getAttribute('dur'), rateInfo);
    if (end == null && duration != null) {
      end = start + duration;
    }
    return {start, end};
  }

  /**
   * Parses a TTML time from the given attribute text.
   *
   * @param {string} text
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @return {?number}
   * @private
   */
  static parseTimeAttribute_(text, rateInfo) {
    let ret = null;
    const TtmlTextParser = shaka.text.TtmlTextParser;

    if (TtmlTextParser.timeColonFormatFrames_.test(text)) {
      ret = TtmlTextParser.parseColonTimeWithFrames_(rateInfo, text);
    } else if (TtmlTextParser.timeColonFormat_.test(text)) {
      ret = TtmlTextParser.parseTimeFromRegex_(
          TtmlTextParser.timeColonFormat_, text);
    } else if (TtmlTextParser.timeColonFormatMilliseconds_.test(text)) {
      ret = TtmlTextParser.parseTimeFromRegex_(
          TtmlTextParser.timeColonFormatMilliseconds_, text);
    } else if (TtmlTextParser.timeFramesFormat_.test(text)) {
      ret = TtmlTextParser.parseFramesTime_(rateInfo, text);
    } else if (TtmlTextParser.timeTickFormat_.test(text)) {
      ret = TtmlTextParser.parseTickTime_(rateInfo, text);
    } else if (TtmlTextParser.timeHMSFormat_.test(text)) {
      ret = TtmlTextParser.parseTimeFromRegex_(
          TtmlTextParser.timeHMSFormat_, text);
    } else if (text) {
      // It's not empty or null, but it doesn't match a known format.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          'Could not parse cue time range in TTML');
    }

    return ret;
  }

  /**
   * Parses a TTML time in frame format.
   *
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {string} text
   * @return {?number}
   * @private
   */
  static parseFramesTime_(rateInfo, text) {
    // 75f or 75.5f
    const results = shaka.text.TtmlTextParser.timeFramesFormat_.exec(text);
    const frames = Number(results[1]);

    return frames / rateInfo.frameRate;
  }

  /**
   * Parses a TTML time in tick format.
   *
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {string} text
   * @return {?number}
   * @private
   */
  static parseTickTime_(rateInfo, text) {
    // 50t or 50.5t
    const results = shaka.text.TtmlTextParser.timeTickFormat_.exec(text);
    const ticks = Number(results[1]);

    return ticks / rateInfo.tickRate;
  }

  /**
   * Parses a TTML colon formatted time containing frames.
   *
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {string} text
   * @return {?number}
   * @private
   */
  static parseColonTimeWithFrames_(rateInfo, text) {
    // 01:02:43:07 ('07' is frames) or 01:02:43:07.1 (subframes)
    const results = shaka.text.TtmlTextParser.timeColonFormatFrames_.exec(text);

    const hours = Number(results[1]);
    const minutes = Number(results[2]);
    let seconds = Number(results[3]);
    let frames = Number(results[4]);
    const subframes = Number(results[5]) || 0;

    frames += subframes / rateInfo.subFrameRate;
    seconds += frames / rateInfo.frameRate;

    return seconds + (minutes * 60) + (hours * 3600);
  }

  /**
   * Parses a TTML time with a given regex. Expects regex to be some
   * sort of a time-matcher to match hours, minutes, seconds and milliseconds
   *
   * @param {!RegExp} regex
   * @param {string} text
   * @return {?number}
   * @private
   */
  static parseTimeFromRegex_(regex, text) {
    const results = regex.exec(text);
    if (results == null || results[0] == '') {
      return null;
    }
    // This capture is optional, but will still be in the array as undefined,
    // in which case it is 0.
    const hours = Number(results[1]) || 0;
    const minutes = Number(results[2]) || 0;
    const seconds = Number(results[3]) || 0;
    const milliseconds = Number(results[4]) || 0;

    return (milliseconds / 1000) + seconds + (minutes * 60) + (hours * 3600);
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
  static getCellResolution_(cellResolution) {
    if (!cellResolution) {
      return null;
    }
    const matches = /^(\d+) (\d+)$/.exec(cellResolution);

    if (!matches) {
      return null;
    }

    const columns = parseInt(matches[1], 10);
    const rows = parseInt(matches[2], 10);

    return {columns, rows};
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
    this.tickRate = Number(tickRate);
    if (this.tickRate == 0) {
      if (frameRate) {
        this.tickRate = this.frameRate * this.subFrameRate;
      } else {
        this.tickRate = 1;
      }
    }

    if (frameRateMultiplier) {
      const multiplierResults = /^(\d+) (\d+)$/g.exec(frameRateMultiplier);
      if (multiplierResults) {
        const numerator = Number(multiplierResults[1]);
        const denominator = Number(multiplierResults[2]);
        const multiplierNum = numerator / denominator;
        this.frameRate *= multiplierNum;
      }
    }
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example 50.17% 10%
 */
shaka.text.TtmlTextParser.percentValues_ =
    /^(\d{1,2}(?:\.\d+)?|100(?:\.0+)?)% (\d{1,2}(?:\.\d+)?|100(?:\.0+)?)%$/;

/**
 * @const
 * @private {!RegExp}
 * @example 0.6% 90%
 */
shaka.text.TtmlTextParser.percentValue_ = /^(\d{1,2}(?:\.\d+)?|100)%$/;

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
 * @example 00:00:40 or 00:40
 */
shaka.text.TtmlTextParser.timeColonFormat_ = /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;

/**
 * @const
 * @private {!RegExp}
 * @example 01:02:43.0345555 or 02:43.03
 */
shaka.text.TtmlTextParser.timeColonFormatMilliseconds_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d{2,})$/;

/**
 * @const
 * @private {!RegExp}
 * @example 75f or 75.5f
 */
shaka.text.TtmlTextParser.timeFramesFormat_ = /^(\d*(?:\.\d*)?)f$/;

/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.text.TtmlTextParser.timeTickFormat_ = /^(\d*(?:\.\d*)?)t$/;

/**
 * @const
 * @private {!RegExp}
 * @example 3.45h, 3m or 4.20s
 */
shaka.text.TtmlTextParser.timeHMSFormat_ =
    new RegExp(['^(?:(\\d*(?:\\.\\d*)?)h)?',
      '(?:(\\d*(?:\\.\\d*)?)m)?',
      '(?:(\\d*(?:\\.\\d*)?)s)?',
      '(?:(\\d*(?:\\.\\d*)?)ms)?$'].join(''));

/**
 * @const
 * @private {!Object.<string, shaka.text.Cue.lineAlign>}
 */
shaka.text.TtmlTextParser.textAlignToLineAlign_ = {
  'left': shaka.text.Cue.lineAlign.START,
  'center': shaka.text.Cue.lineAlign.CENTER,
  'right': shaka.text.Cue.lineAlign.END,
  'start': shaka.text.Cue.lineAlign.START,
  'end': shaka.text.Cue.lineAlign.END,
};

/**
 * @const
 * @private {!Object.<string, shaka.text.Cue.positionAlign>}
 */
shaka.text.TtmlTextParser.textAlignToPositionAlign_ = {
  'left': shaka.text.Cue.positionAlign.LEFT,
  'center': shaka.text.Cue.positionAlign.CENTER,
  'right': shaka.text.Cue.positionAlign.RIGHT,
};

/**
 * The namespace URL for TTML parameters.  Can be assigned any name in the TTML
 * document, not just "ttp:", so we use this with getAttributeNS() to ensure
 * that we support arbitrary namespace names.
 *
 * @const {!Array.<string>}
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
 * @const {!Array.<string>}
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
 * @const {!Array.<string>}
 * @private
 */
shaka.text.TtmlTextParser.smpteNsList_ = [
  'http://www.smpte-ra.org/schemas/2052-1/2010/smpte-tt',
  'http://www.smpte-ra.org/schemas/2052-1/2013/smpte-tt',
];

shaka.text.TextEngine.registerParser(
    'application/ttml+xml', () => new shaka.text.TtmlTextParser());
