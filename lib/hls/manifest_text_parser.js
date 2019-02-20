/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
 * Creates a new ManifestTextParser.
 *
 * @constructor
 * @struct
 */
shaka.hls.ManifestTextParser = function() {
  /** @private {number} */
  this.globalId_ = 0;
};


/**
 * @param {ArrayBuffer} data
 * @param {string} absolutePlaylistUri An absolute, final URI after redirects.
 * @return {!shaka.hls.Playlist}
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.prototype.parsePlaylist =
    function(data, absolutePlaylistUri) {
  const MEDIA_PLAYLIST_TAGS = shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS;
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
  for (let i = 1; i < lines.length; i++) {
    // Ignore comments.
    if (!shaka.hls.Utils.isComment(lines[i])) {
      const tag = this.parseTag_(lines[i]);
      // These tags won't actually be used, so don't increment the global id.
      this.globalId_ -= 1;

      if (MEDIA_PLAYLIST_TAGS.includes(tag.name)) {
        playlistType = shaka.hls.PlaylistType.MEDIA;
        break;
      } else if (tag.name == 'EXT-X-STREAM-INF') {
        i += 1;
      }
    }
  }

  /** {Array.<shaka.hls.Tag>} */
  const tags = [];
  for (let i = 1; i < lines.length;) {
    // Skip comments
    if (shaka.hls.Utils.isComment(lines[i])) {
      i += 1;
      continue;
    }

    const tag = this.parseTag_(lines[i]);
    if (SEGMENT_TAGS.includes(tag.name)) {
      if (playlistType != shaka.hls.PlaylistType.MEDIA) {
        // Only media playlists should contain segment tags
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
      }

      const segmentsData = lines.splice(i, lines.length - i);
      const segments = this.parseSegments_(
          absolutePlaylistUri, segmentsData, tags);
      return new shaka.hls.Playlist(
          absolutePlaylistUri, playlistType, tags, segments);
    }

    tags.push(tag);
    i += 1;

    // An EXT-X-STREAM-INF tag is followed by a URI of a media playlist.
    // Add the URI to the tag object.
    if (tag.name == 'EXT-X-STREAM-INF') {
      const tagUri = new shaka.hls.Attribute('URI', lines[i]);
      tag.addAttribute(tagUri);
      i += 1;
    }
  }

  return new shaka.hls.Playlist(absolutePlaylistUri, playlistType, tags);
};


/**
 * Parses an array of strings into an array of HLS Segment objects.
 *
 * @param {string} absoluteMediaPlaylistUri
 * @param {!Array.<string>} lines
 * @param {!Array.<!shaka.hls.Tag>} playlistTags
 * @return {!Array.<shaka.hls.Segment>}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.prototype.parseSegments_ =
    function(absoluteMediaPlaylistUri, lines, playlistTags) {
  /** @type {!Array.<shaka.hls.Segment>} */
  let segments = [];
  /** @type {!Array.<shaka.hls.Tag>} */
  let segmentTags = [];
  lines.forEach((line) => {
    if (/^(#EXT)/.test(line)) {
      let tag = this.parseTag_(line);
      if (shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS.includes(tag.name)) {
        playlistTags.push(tag);
      } else {
        segmentTags.push(tag);
      }
    } else if (shaka.hls.Utils.isComment(line)) {
      // Skip comments.
      return [];
    } else {
      const verbatimSegmentUri = line.trim();
      const absoluteSegmentUri = shaka.hls.Utils.constructAbsoluteUri(
          absoluteMediaPlaylistUri, verbatimSegmentUri);

      // The URI appears after all of the tags describing the segment.
      const segment = new shaka.hls.Segment(absoluteSegmentUri, segmentTags);
      segments.push(segment);
      segmentTags = [];
    }
  });
  return segments;
};


/**
 * Parses a string into an HLS Tag object while tracking what id to use next.
 *
 * @param {string} word
 * @return {!shaka.hls.Tag}
 * @throws {shaka.util.Error}
 * @private
 */
shaka.hls.ManifestTextParser.prototype.parseTag_ = function(word) {
  return shaka.hls.ManifestTextParser.parseTag(this.globalId_++, word);
};


/**
 * Parses a string into an HLS Tag object.
 *
 * @param {number} id
 * @param {string} word
 * @return {!shaka.hls.Tag}
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.parseTag = function(id, word) {
  /* HLS tags start with '#EXT'. A tag can have a set of attributes
    (#EXT-<tagname>:<attribute list>) and/or a value (#EXT-<tagname>:<value>).
    An attribute's format is 'AttributeName=AttributeValue'.
    The parsing logic goes like this:
     1. Everything before ':' is a name (we ignore '#').
     2. Everything after ':' is a list of comma-seprated items,
          2a. The first item might be a value, if it does not contain '='.
          2b. Otherwise, items are attributes.
     3. If there is no ":", it's a simple tag with no attributes and no value */
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
    }
  }

  return new shaka.hls.Tag(id, name, attributes, value);
};


/**
 * HLS tags that only appear on Media Playlists.
 * Used to determine a playlist type.
 *
 * @const {!Array.<string>}
 */
shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS = [
  'EXT-X-TARGETDURATION',
  'EXT-X-MEDIA-SEQUENCE',
  'EXT-X-DISCONTINUITY-SEQUENCE',
  'EXT-X-PLAYLIST-TYPE',
  'EXT-X-MAP',
  'EXT-X-I-FRAMES-ONLY',
  'EXT-X-ENDLIST',
];


/**
 * HLS tags that only appear on Segments in a Media Playlists.
 * Used to determine the start of the segments info.
 *
 * @const {!Array.<string>}
 */
shaka.hls.ManifestTextParser.SEGMENT_TAGS = [
  'EXTINF',
  'EXT-X-BYTERANGE',
  'EXT-X-DISCONTINUITY',
  'EXT-X-PROGRAM-DATE-TIME',
  'EXT-X-KEY',
  'EXT-X-DATERANGE',
];
