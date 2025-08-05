/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.hls.ManifestTextParser');

goog.require('shaka.hls.Attribute');
goog.require('shaka.hls.Playlist');
goog.require('shaka.hls.PlaylistType');
goog.require('shaka.hls.Segment');
goog.require('shaka.hls.Tag');
goog.require('shaka.hls.Utils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * HlS manifest text parser.
 */
shaka.hls.ManifestTextParser = class {
  constructor() {
    /** @private {number} */
    this.globalId_ = 0;
  }

  /**
   * @param {BufferSource} data
   * @return {!shaka.hls.Playlist}
   */
  parsePlaylist(data) {
    const MEDIA_PLAYLIST_TAGS =
        shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS;
    const SEGMENT_TAGS = shaka.hls.ManifestTextParser.SEGMENT_TAGS;

    // Get the input as a string.  Normalize newlines to \n.
    let str = shaka.util.StringUtils.fromUTF8(data);
    str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n').trim();

    const lines = str.split(/\n+/m);

    if (!/^#EXTM3U($|[ \t\n])/m.test(lines[0])) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.HLS_PLAYLIST_HEADER_MISSING);
    }

    /** shaka.hls.PlaylistType */
    let playlistType = shaka.hls.PlaylistType.MASTER;

    // First, look for media playlist tags, so that we know what the playlist
    // type really is before we start parsing.
    // TODO: refactor the for loop for better readability.
    // Whether to skip the next element; initialize to true to skip first elem.
    let skip = true;
    for (const line of lines) {
      // Ignore comments.
      if (shaka.hls.Utils.isComment(line) || skip) {
        skip = false;
        continue;
      }
      const tag = this.parseTag_(line);
      // These tags won't actually be used, so don't increment the global
      // id.
      this.globalId_ -= 1;

      if (MEDIA_PLAYLIST_TAGS.includes(tag.name)) {
        playlistType = shaka.hls.PlaylistType.MEDIA;
        break;
      } else if (tag.name == 'EXT-X-STREAM-INF') {
        skip = true;
      }
    }

    /** {Array<shaka.hls.Tag>} */
    const tags = [];
    // Initialize to "true" to skip the first element.
    skip = true;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1];
      // Skip comments
      if (shaka.hls.Utils.isComment(line) || skip) {
        skip = false;
        continue;
      }

      const tag = this.parseTag_(line);
      if (SEGMENT_TAGS.includes(tag.name)) {
        if (playlistType != shaka.hls.PlaylistType.MEDIA) {
          // Only media playlists should contain segment tags
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
        }

        const segmentsData = lines.splice(i, lines.length - i);
        const segments = this.parseSegments_(segmentsData, tags);
        return new shaka.hls.Playlist(playlistType, tags, segments);
      }

      tags.push(tag);

      // An EXT-X-STREAM-INF tag is followed by a URI of a media playlist.
      // Add the URI to the tag object.
      if (tag.name == 'EXT-X-STREAM-INF') {
        const tagUri = new shaka.hls.Attribute('URI', next);
        tag.addAttribute(tagUri);
        skip = true;
      }
    }

    return new shaka.hls.Playlist(playlistType, tags);
  }

  /**
   * Parses an array of strings into an array of HLS Segment objects.
   *
   * @param {!Array<string>} lines
   * @param {!Array<!shaka.hls.Tag>} playlistTags
   * @return {!Array<shaka.hls.Segment>}
   * @private
   */
  parseSegments_(lines, playlistTags) {
    /** @type {!Array<shaka.hls.Segment>} */
    const segments = [];
    /** @type {!Array<shaka.hls.Tag>} */
    let segmentTags = [];

    /** @type {!Array<shaka.hls.Tag>} */
    let partialSegmentTags = [];

    // The last parsed EXT-X-MAP tag.
    /** @type {?shaka.hls.Tag} */
    let currentMapTag = null;

    for (const line of lines) {
      if (/^(#EXT)/.test(line)) {
        const tag = this.parseTag_(line);
        if (shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS.includes(
            tag.name)) {
          playlistTags.push(tag);
        } else {
          // Mark the the EXT-X-MAP tag, and add it to the segment tags
          // following it later.
          if (tag.name == 'EXT-X-MAP') {
            currentMapTag = tag;
          } else if (tag.name == 'EXT-X-PART') {
            partialSegmentTags.push(tag);
          } else if (tag.name == 'EXT-X-PRELOAD-HINT') {
            if (tag.getAttributeValue('TYPE') == 'PART') {
              partialSegmentTags.push(tag);
            } else if (tag.getAttributeValue('TYPE') == 'MAP') {
              // Rename the Preload Hint tag to be a Map tag.
              tag.setName('EXT-X-MAP');
              currentMapTag = tag;
            }
          } else {
            segmentTags.push(tag);
          }
        }
      } else if (shaka.hls.Utils.isComment(line)) {
        // Skip comments.
      } else {
        const verbatimSegmentUri = line.trim();
        // Attach the last parsed EXT-X-MAP tag to the segment.
        if (currentMapTag) {
          segmentTags.push(currentMapTag);
        }
        // The URI appears after all of the tags describing the segment.
        const segment = new shaka.hls.Segment(
            verbatimSegmentUri, segmentTags, partialSegmentTags);
        segments.push(segment);
        segmentTags = [];
        partialSegmentTags = [];
      }
    }
    // After all the partial segments of a regular segment is published,
    // a EXTINF tag and Uri for a regular segment containing the same media
    // content will get published at last.
    // If no EXTINF tag follows the list of partial segment tags at the end,
    // create a segment to wrap the partial segment tags.
    if (partialSegmentTags.length) {
      if (currentMapTag) {
        segmentTags.push(currentMapTag);
      }
      const segment = new shaka.hls.Segment('', segmentTags,
          partialSegmentTags);
      segments.push(segment);
    }

    return segments;
  }

  /**
   * Parses a string into an HLS Tag object while tracking what id to use next.
   *
   * @param {string} word
   * @return {!shaka.hls.Tag}
   * @private
   */
  parseTag_(word) {
    return shaka.hls.ManifestTextParser.parseTag(this.globalId_++, word);
  }

  /**
   * Parses a string into an HLS Tag object.
   *
   * @param {number} id
   * @param {string} word
   * @return {!shaka.hls.Tag}
   */
  static parseTag(id, word) {
    /* HLS tags start with '#EXT'. A tag can have a set of attributes
      (#EXT-<tagname>:<attribute list>) and/or a value (#EXT-<tagname>:<value>).
      An attribute's format is 'AttributeName=AttributeValue'.
      The parsing logic goes like this:
       1. Everything before ':' is a name (we ignore '#').
       2. Everything after ':' is a list of comma-separated items,
            2a. The first item might be a value, if it does not contain '='.
            2b. Otherwise, items are attributes.
       3. If there is no ":", it's a simple tag with no attributes and no value.
    */
    const blocks = word.match(/^#(EXT[^:]*)(?::(.*))?$/);
    if (!blocks) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.INVALID_HLS_TAG,
          word);
    }
    const name = blocks[1];
    const data = blocks[2];
    const attributes = [];
    let value;

    if (data) {
      const parser = new shaka.util.TextParser(data);
      let blockAttrs;

      // Regex: any number of non-equals-sign characters at the beginning
      // terminated by comma or end of line
      const valueRegex = /^([^,=]+)(?:,|$)/g;

      const blockValue = parser.readRegex(valueRegex);

      if (blockValue) {
        value = blockValue[1];
      }

      // Regex:
      // 1. Key name ([1])
      // 2. Equals sign
      // 3. Either:
      //   a. A quoted string (everything up to the next quote, [2])
      //   b. An unquoted string
      //    (everything up to the next comma or end of line, [3])
      // 4. Either:
      //   a. A comma
      //   b. End of line
      const attributeRegex = /([^=]+)=(?:"([^"]*)"|([^",]*))(?:,|$)/g;

      while ((blockAttrs = parser.readRegex(attributeRegex))) {
        const attrName = blockAttrs[1];
        const attrValue = blockAttrs[2] || blockAttrs[3];
        const attribute = new shaka.hls.Attribute(attrName, attrValue);
        attributes.push(attribute);
        parser.skipWhitespace();
      }
    }

    return new shaka.hls.Tag(id, name, attributes, value);
  }
};


/**
 * HLS tags that only appear on Media Playlists.
 * Used to determine a playlist type.
 *
 * @const {!Array<string>}
 */
shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS = [
  'EXT-X-TARGETDURATION',
  'EXT-X-MEDIA-SEQUENCE',
  'EXT-X-DISCONTINUITY-SEQUENCE',
  'EXT-X-PLAYLIST-TYPE',
  'EXT-X-I-FRAMES-ONLY',
  'EXT-X-ENDLIST',
  'EXT-X-SERVER-CONTROL',
  'EXT-X-SKIP',
  'EXT-X-PART-INF',
  'EXT-X-DATERANGE',
];


/**
 * HLS tags that only appear on Segments in a Media Playlists.
 * Used to determine the start of the segments info.
 *
 * @const {!Array<string>}
 */
shaka.hls.ManifestTextParser.SEGMENT_TAGS = [
  'EXTINF',
  'EXT-X-BYTERANGE',
  'EXT-X-DISCONTINUITY',
  'EXT-X-PROGRAM-DATE-TIME',
  'EXT-X-KEY',
  'EXT-X-DATERANGE',
  'EXT-X-MAP',
  'EXT-X-GAP',
  'EXT-X-TILES',
];
