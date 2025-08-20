/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.TtmlTextParser');

goog.require('goog.asserts');
goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.text.Cue');
goog.require('shaka.text.CueRegion');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');


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
  setSequenceMode(sequenceMode) {
    // Unused.
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
    const ttpNs = TtmlTextParser.parameterNs_;
    const ttsNs = TtmlTextParser.styleNs_;
    const str = shaka.util.StringUtils.fromUTF8(data);
    const cues = [];

    // dont try to parse empty string as
    // DOMParser will not throw error but return an errored xml
    if (str == '') {
      return cues;
    }

    const tt = TXml.parseXmlString(str, 'tt', /* includeParent= */ true);
    if (!tt) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_XML,
          'Failed to parse TTML.');
    }

    const body = TXml.getElementsByTagName(tt, 'body')[0];
    if (!body) {
      return [];
    }

    // Get the framerate, subFrameRate and frameRateMultiplier if applicable.
    const frameRate = TXml.getAttributeNSList(tt, ttpNs, 'frameRate');
    const subFrameRate = TXml.getAttributeNSList(
        tt, ttpNs, 'subFrameRate');
    const frameRateMultiplier =
        TXml.getAttributeNSList(tt, ttpNs, 'frameRateMultiplier');
    const tickRate = TXml.getAttributeNSList(tt, ttpNs, 'tickRate');

    const cellResolution = TXml.getAttributeNSList(
        tt, ttpNs, 'cellResolution');
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

    const rateInfo = new TtmlTextParser.RateInfo_(
        frameRate, subFrameRate, frameRateMultiplier, tickRate);

    const cellResolutionInfo = this.getCellResolution_(cellResolution);

    const metadata = TXml.getElementsByTagName(tt, 'metadata')[0];
    const metadataElements =
        (metadata ? metadata.children : []).filter((c) => c != '\n');
    const styles = TXml.getElementsByTagName(tt, 'style');
    const regionElements = TXml.getElementsByTagName(tt, 'region');

    const cueRegions = [];
    for (const region of regionElements) {
      const cueRegion = this.parseCueRegion_(region, styles, extent);
      if (cueRegion) {
        cueRegions.push(cueRegion);
      }
    }

    // A <body> element should only contain <div> elements, not <p> or <span>
    // elements.  We used to allow this, but it is non-compliant, and the
    // loose nature of our previous parser made it difficult to implement TTML
    // nesting more fully.
    if (TXml.findChildren(body, 'p').length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_TEXT_CUE,
          '<p> can only be inside <div> in TTML');
    }

    for (const div of TXml.findChildren(body, 'div')) {
      // A <div> element should only contain <p>, not <span>.
      if (TXml.findChildren(div, 'span').length) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_TEXT_CUE,
            '<span> can only be inside <p> in TTML');
      }
    }

    const cue = this.parseCue_(
        body, time, rateInfo, metadataElements, styles,
        regionElements, cueRegions, collapseMultipleSpaces,
        cellResolutionInfo, /* parentCueElement= */ null,
        /* isContent= */ false, uri, images);
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
   * @return {shaka.text.Cue}
   * @private
   */
  parseCue_(
      cueNode, timeContext, rateInfo, metadataElements, styles, regionElements,
      cueRegions, collapseMultipleSpaces, cellResolution, parentCueElement,
      isContent, uri, images) {
    const TXml = shaka.util.TXml;
    const StringUtils = shaka.util.StringUtils;
    /** @type {shaka.extern.xml.Node} */
    let cueElement;
    /** @type {?shaka.extern.xml.Node} */
    let parentElement = parentCueElement;

    if (TXml.isText(cueNode)) {
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
    for (const nameSpace of shaka.text.TtmlTextParser.smpteNsList_) {
      imageElement = this.getElementsFromCollection_(
          cueElement, 'backgroundImage', metadataElements, '#',
          nameSpace)[0];
      if (imageElement) {
        break;
      }
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
        return null;
      }
      imageUri = images[index];
    } else if (uri && backgroundImage && !backgroundImage.startsWith('#')) {
      const baseUri = new goog.Uri(uri);
      const relativeUri = new goog.Uri(backgroundImage);
      const newUri = baseUri.resolve(relativeUri).toString();
      if (newUri) {
        imageUri = newUri;
      }
    }

    if (cueNode.tagName == 'p' || imageElement || imageUri) {
      isContent = true;
    }

    const parentIsContent = isContent;

    const spaceStyle = cueElement.attributes['xml:space'] ||
        (collapseMultipleSpaces ? 'default' : 'preserve');

    const localCollapseMultipleSpaces = spaceStyle == 'default';

    // Parse any nested cues first.
    const isLeafNode = cueElement.children.every(TXml.isText);
    const nestedCues = [];
    if (!isLeafNode) {
      // Otherwise, recurse into the children.  Text nodes will convert into
      // anonymous spans, which will then be leaf nodes.
      for (const childNode of cueElement.children) {
        const nestedCue = this.parseCue_(
            childNode,
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
        );

        // This node may or may not generate a nested cue.
        if (nestedCue) {
          nestedCues.push(nestedCue);
        }
      }
    }

    const isNested = /** @type {boolean} */ (parentCueElement != null);

    const textContent = TXml.getTextContents(cueElement);
    // In this regex, "\S" means "non-whitespace character".
    const hasTextContent = cueElement.children.length &&
        textContent &&
        /\S/.test(textContent);

    const hasTimeAttributes =
        cueElement.attributes['begin'] ||
        cueElement.attributes['end'] ||
        cueElement.attributes['dur'];

    if (!hasTimeAttributes && !hasTextContent && cueElement.tagName != 'br' &&
        nestedCues.length == 0) {
      if (!isNested) {
        // Disregards empty <p> elements without time attributes nor content.
        // <p begin="..." smpte:backgroundImage="..." /> will go through,
        // as some information could be held by its attributes.
        // <p /> won't, as it would not be displayed.
        return null;
      } else if (localCollapseMultipleSpaces) {
        // Disregards empty anonymous spans when (local) trim is true.
        return null;
      }
    }

    // Get local time attributes.
    let {start, end} = this.parseTime_(cueElement, rateInfo);
    // Resolve local time relative to parent elements.  Time elements can appear
    // all the way up to 'body', but not 'tt'.
    while (parentElement && TXml.isNode(parentElement) &&
        parentElement.tagName != 'tt') {
      ({start, end} = this.resolveTime_(parentElement, rateInfo, start, end));
      parentElement =
        /** @type {shaka.extern.xml.Node} */ (parentElement.parent);
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
      payload = StringUtils.htmlUnescape(
          shaka.util.TXml.getTextContents(cueElement) || '');
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

    // Get other properties if available.
    const regionElement = this.getElementsFromCollection_(
        cueElement, 'region', regionElements, /* prefix= */ '')[0];
    // Do not actually apply that region unless it is non-inherited, though.
    // This makes it so that, if a parent element has a region, the children
    // don't also all independently apply the positioning of that region.
    if (cueElement.attributes['region']) {
      if (regionElement && regionElement.attributes['xml:id']) {
        const regionId = regionElement.attributes['xml:id'];
        cue.region = cueRegions.filter((region) => region.id == regionId)[0];
      }
    }

    let regionElementForStyle = regionElement;
    if (parentCueElement && isNested && !cueElement.attributes['region'] &&
      !cueElement.attributes['style']) {
      regionElementForStyle = this.getElementsFromCollection_(
          parentCueElement, 'region', regionElements, /* prefix= */ '')[0];
    }

    this.addStyle_(
        cue,
        cueElement,
        regionElementForStyle,
        /** @type {!shaka.extern.xml.Node} */(imageElement),
        imageUri,
        styles,
        /** isNested= */ parentIsContent, // "nested in a <div>" doesn't count.
        /** isLeaf= */ (nestedCues.length == 0));

    return cue;
  }

  /**
   * Parses an Element into a TextTrackCue or VTTCue.
   *
   * @param {!shaka.extern.xml.Node} regionElement
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * Defined in the top of tt element and used principally for images.
   * @param {?string} globalExtent
   * @return {shaka.text.CueRegion}
   * @private
   */
  parseCueRegion_(regionElement, styles, globalExtent) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const region = new shaka.text.CueRegion();
    const id = regionElement.attributes['xml:id'];
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
    const extent = this.getStyleAttributeFromRegion_(
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

    const origin = this.getStyleAttributeFromRegion_(
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
        } else if (!extent) {
          region.width = 100 - region.viewportAnchorX;
          region.widthUnits = shaka.text.CueRegion.units.PERCENTAGE;
          region.height = 100 - region.viewportAnchorY;
          region.heightUnits = shaka.text.CueRegion.units.PERCENTAGE;
        }

        region.viewportAnchorUnits = percentage || globalWidth != null ?
                  shaka.text.CueRegion.units.PERCENTAGE :
                  shaka.text.CueRegion.units.PX;
      }
    }

    return region;
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
      const values = rgba[1].split(',');
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
   * @param {shaka.extern.xml.Node} region
   * @param {shaka.extern.xml.Node} imageElement
   * @param {?string} imageUri
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {boolean} isNested
   * @param {boolean} isLeaf
   * @private
   */
  addStyle_(
      cue, cueElement, region, imageElement, imageUri, styles,
      isNested, isLeaf) {
    const TtmlTextParser = shaka.text.TtmlTextParser;
    const TXml = shaka.util.TXml;
    const Cue = shaka.text.Cue;

    // Styles should be inherited from regions, if a style property is not
    // associated with a Content element (or an anonymous span).
    const shouldInheritRegionStyles = isNested || isLeaf;

    const direction = this.getStyleAttribute_(
        cueElement, region, styles, 'direction', shouldInheritRegionStyles);
    if (direction == 'rtl') {
      cue.direction = Cue.direction.HORIZONTAL_RIGHT_TO_LEFT;
    }

    // Direction attribute specifies one-dimensional writing direction
    // (left to right or right to left). Writing mode specifies that
    // plus whether text is vertical or horizontal.
    // They should not contradict each other. If they do, we give
    // preference to writing mode.
    const writingMode = this.getStyleAttribute_(
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

    const align = this.getStyleAttribute_(
        cueElement, region, styles, 'textAlign', true);
    if (align) {
      cue.positionAlign = TtmlTextParser.textAlignToPositionAlign_.get(align);
      cue.lineAlign = TtmlTextParser.textAlignToLineAlign_.get(align);

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
        cueElement, region, styles, 'displayAlign', true);
    if (displayAlign) {
      goog.asserts.assert(displayAlign.toUpperCase() in Cue.displayAlign,
          displayAlign.toUpperCase() +
                          ' Should be in Cue.displayAlign values!');
      cue.displayAlign = Cue.displayAlign[displayAlign.toUpperCase()];
    }

    const color = this.getStyleAttribute_(
        cueElement, region, styles, 'color', shouldInheritRegionStyles);
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
    const backgroundColor = this.getStyleAttribute_(
        cueElement, region, styles, 'backgroundColor',
        shouldInheritRegionStyles);
    if (backgroundColor) {
      cue.backgroundColor = this.convertTTMLrgbaToHTMLrgba_(backgroundColor);
    }

    const border = this.getStyleAttribute_(
        cueElement, region, styles, 'border', shouldInheritRegionStyles);
    if (border) {
      cue.border = border;
    }

    const fontFamily = this.getStyleAttribute_(
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
          // cspell: disable-next-line
          cue.fontFamily = 'Consolas,monospace';
          break;
        case 'proportionalSerif':
          cue.fontFamily = 'serif';
          break;
        default:
          cue.fontFamily = fontFamily.split(',').filter((font) => {
            return font != 'default';
          }).join(',');
          break;
      }
    }

    const fontWeight = this.getStyleAttribute_(
        cueElement, region, styles, 'fontWeight', shouldInheritRegionStyles);
    if (fontWeight && fontWeight == 'bold') {
      cue.fontWeight = Cue.fontWeight.BOLD;
    }

    const wrapOption = this.getStyleAttribute_(
        cueElement, region, styles, 'wrapOption', shouldInheritRegionStyles);
    if (wrapOption && wrapOption == 'noWrap') {
      cue.wrapLine = false;
    } else {
      cue.wrapLine = true;
    }

    const lineHeight = this.getStyleAttribute_(
        cueElement, region, styles, 'lineHeight', shouldInheritRegionStyles);
    if (lineHeight && lineHeight.match(TtmlTextParser.unitValues_)) {
      cue.lineHeight = lineHeight;
    }

    const fontSize = this.getStyleAttribute_(
        cueElement, region, styles, 'fontSize', shouldInheritRegionStyles);
    if (fontSize) {
      const isValidFontSizeUnit =
          fontSize.match(TtmlTextParser.unitValues_) ||
          fontSize.match(TtmlTextParser.percentValue_);

      if (isValidFontSizeUnit) {
        cue.fontSize = fontSize;
      }
    }

    const fontStyle = this.getStyleAttribute_(
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

    const textOutline = this.getStyleAttribute_(
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
        cue.textStrokeColor = this.convertTTMLrgbaToHTMLrgba_(split[0]);
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

    const letterSpacing = this.getStyleAttribute_(
        cueElement, region, styles, 'letterSpacing', shouldInheritRegionStyles);
    if (letterSpacing && letterSpacing.match(TtmlTextParser.unitValues_)) {
      cue.letterSpacing = letterSpacing;
    }

    const linePadding = this.getStyleAttribute_(
        cueElement, region, styles, 'linePadding', shouldInheritRegionStyles);
    if (linePadding && linePadding.match(TtmlTextParser.unitValues_)) {
      cue.linePadding = linePadding;
    }

    const opacity = this.getStyleAttribute_(
        cueElement, region, styles, 'opacity', shouldInheritRegionStyles);
    if (opacity) {
      cue.opacity = parseFloat(opacity);
    }

    // Text decoration is an array of values which can come both from the
    // element's style or be inherited from elements' parent nodes. All of those
    // values should be applied as long as they don't contradict each other. If
    // they do, elements' own style gets preference.
    const textDecorationRegion = this.getStyleAttributeFromRegion_(
        region, styles, 'textDecoration');
    if (textDecorationRegion) {
      this.addTextDecoration_(cue, textDecorationRegion);
    }

    const textDecorationElement = this.getStyleAttributeFromElement_(
        cueElement, styles, 'textDecoration');
    if (textDecorationElement) {
      this.addTextDecoration_(cue, textDecorationElement);
    }

    const textCombine = this.getStyleAttribute_(
        cueElement, region, styles, 'textCombine', shouldInheritRegionStyles);
    if (textCombine) {
      cue.textCombineUpright = textCombine;
    }

    const ruby = this.getStyleAttribute_(
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
  addTextDecoration_(cue, decoration) {
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
   * @param {!shaka.extern.xml.Node} cueElement
   * @param {shaka.extern.xml.Node} region
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
    const attr = this.getStyleAttributeFromElement_(
        cueElement, styles, attribute);
    if (attr) {
      return attr;
    }

    if (shouldInheritRegionStyles) {
      return this.getStyleAttributeFromRegion_(region, styles, attribute);
    }
    return null;
  }

  /**
   * Finds a specified attribute on the element's associated region
   * and returns the value if the attribute was found.
   *
   * @param {shaka.extern.xml.Node} region
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getStyleAttributeFromRegion_(region, styles, attribute) {
    const TXml = shaka.util.TXml;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;

    if (!region) {
      return null;
    }

    const attr = TXml.getAttributeNSList(region, ttsNs, attribute);
    if (attr) {
      return attr;
    }

    return this.getInheritedStyleAttribute_(region, styles, attribute);
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
    const TXml = shaka.util.TXml;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;

    // Styling on elements should take precedence
    // over the main styling attributes
    const elementAttribute = TXml.getAttributeNSList(
        cueElement,
        ttsNs,
        attribute);

    if (elementAttribute) {
      return elementAttribute;
    }
    return this.getInheritedStyleAttribute_(cueElement, styles, attribute);
  }

  /**
   * Finds a specified attribute on an element's styles and the styles those
   * styles inherit from.
   *
   * @param {!shaka.extern.xml.Node} element
   * @param {!Array<!shaka.extern.xml.Node>} styles
   * @param {string} attribute
   * @return {?string}
   * @private
   */
  getInheritedStyleAttribute_(element, styles, attribute) {
    const TXml = shaka.util.TXml;
    const ttsNs = shaka.text.TtmlTextParser.styleNs_;
    const ebuttsNs = shaka.text.TtmlTextParser.styleEbuttsNs_;

    const inheritedStyles = this.getElementsFromCollection_(
        element, 'style', styles, /* prefix= */ '');

    let styleValue = null;

    // The last value in our styles stack takes the precedence over the others
    for (let i = 0; i < inheritedStyles.length; i++) {
      // Check ebu namespace first.
      let styleAttributeValue = TXml.getAttributeNS(
          inheritedStyles[i],
          ebuttsNs,
          attribute);

      if (!styleAttributeValue) {
        // Fall back to tts namespace.
        styleAttributeValue = TXml.getAttributeNSList(
            inheritedStyles[i],
            ttsNs,
            attribute);
      }

      if (!styleAttributeValue) {
        // Next, check inheritance.
        // Styles can inherit from other styles, so traverse up that chain.
        styleAttributeValue = this.getStyleAttributeFromElement_(
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
    const items = [];

    if (!element || collection.length < 1) {
      return items;
    }

    const attributeValue = this.getInheritedAttribute_(
        element, attributeName, nsName);

    if (attributeValue) {
      // There could be multiple items in one attribute
      // <span style="style1 style2">A cue</span>
      const itemNames = attributeValue.split(' ');

      for (const name of itemNames) {
        for (const item of collection) {
          if ((prefixName + item.attributes['xml:id']) == name) {
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
   * @param {!shaka.extern.xml.Node} element
   * @param {string} attributeName
   * @param {string=} nsName
   * @return {?string}
   * @private
   */
  getInheritedAttribute_(element, attributeName, nsName) {
    let ret = null;
    const TXml = shaka.util.TXml;
    while (!ret) {
      ret = nsName ?
          TXml.getAttributeNS(element, nsName, attributeName) :
          element.attributes[attributeName];
      if (ret) {
        break;
      }

      // Element.parentNode can lead to XMLDocument, which is not an Element and
      // has no getAttribute().
      const parentNode = element.parent;
      if (parentNode) {
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
   * @param {!shaka.extern.xml.Node} parentElement
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @param {?number} start The child's start time
   * @param {?number} end The child's end time
   * @return {{start: ?number, end: ?number}}
   * @private
   */
  resolveTime_(parentElement, rateInfo, start, end) {
    const parentTime = this.parseTime_(parentElement, rateInfo);

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
   * @param {!shaka.extern.xml.Node} element
   * @param {!shaka.text.TtmlTextParser.RateInfo_} rateInfo
   * @return {{start: ?number, end: ?number}}
   * @private
   */
  parseTime_(element, rateInfo) {
    const start = this.parseTimeAttribute_(
        element.attributes['begin'], rateInfo);
    let end = this.parseTimeAttribute_(
        element.attributes['end'], rateInfo);
    const duration = this.parseTimeAttribute_(
        element.attributes['dur'], rateInfo);
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
  parseTimeAttribute_(text, rateInfo) {
    let ret = null;
    const TtmlTextParser = shaka.text.TtmlTextParser;

    if (TtmlTextParser.timeColonFormatFrames_.test(text)) {
      ret = this.parseColonTimeWithFrames_(rateInfo, text);
    } else if (TtmlTextParser.timeColonFormat_.test(text)) {
      ret = this.parseTimeFromRegex_(TtmlTextParser.timeColonFormat_, text);
    } else if (TtmlTextParser.timeColonFormatMilliseconds_.test(text)) {
      ret = this.parseTimeFromRegex_(
          TtmlTextParser.timeColonFormatMilliseconds_, text);
    } else if (TtmlTextParser.timeFramesFormat_.test(text)) {
      ret = this.parseFramesTime_(rateInfo, text);
    } else if (TtmlTextParser.timeTickFormat_.test(text)) {
      ret = this.parseTickTime_(rateInfo, text);
    } else if (TtmlTextParser.timeHMSFormat_.test(text)) {
      ret = this.parseTimeFromRegex_(TtmlTextParser.timeHMSFormat_, text);
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
  parseFramesTime_(rateInfo, text) {
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
  parseTickTime_(rateInfo, text) {
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
  parseColonTimeWithFrames_(rateInfo, text) {
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
  parseTimeFromRegex_(regex, text) {
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
  getCellResolution_(cellResolution) {
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
 * @example 00:00:40 or 00:40
 */
shaka.text.TtmlTextParser.timeColonFormat_ = /^(?:(\d{2,}):)?(\d{2}):(\d{2})$/;

/**
 * @const
 * @private {!RegExp}
 * @example 01:02:43.0345555 or 02:43.03 or 02:45.5
 */
shaka.text.TtmlTextParser.timeColonFormatMilliseconds_ =
    /^(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d+)$/;

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
 * @private {!Map<string, shaka.text.Cue.lineAlign>}
 */
shaka.text.TtmlTextParser.textAlignToLineAlign_ = new Map()
    .set('left', shaka.text.Cue.lineAlign.START)
    .set('center', shaka.text.Cue.lineAlign.CENTER)
    .set('right', shaka.text.Cue.lineAlign.END)
    .set('start', shaka.text.Cue.lineAlign.START)
    .set('end', shaka.text.Cue.lineAlign.END);

/**
 * @const
 * @private {!Map<string, shaka.text.Cue.positionAlign>}
 */
shaka.text.TtmlTextParser.textAlignToPositionAlign_ = new Map()
    .set('left', shaka.text.Cue.positionAlign.LEFT)
    .set('center', shaka.text.Cue.positionAlign.CENTER)
    .set('right', shaka.text.Cue.positionAlign.RIGHT);

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
