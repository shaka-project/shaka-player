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
 * @param {!ArrayBuffer} data
 * @param {!string} uri
 * @return {!shaka.hls.Playlist}
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.prototype.parsePlaylist = function(data, uri) {
  // Get the input as a string.  Normalize newlines to \n.
  var str = shaka.util.StringUtils.fromUTF8(data);
  str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n').trim();

  var lines = str.split(/\n+/m);

  if (!/^#EXTM3U($|[ \t\n])/m.test(lines[0])) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_PLAYLIST_HEADER_MISSING);
  }

  /** shaka.hls.PlaylistType */
  var playlistType = shaka.hls.PlaylistType.MASTER;

  /** {Array.<shaka.hls.Tag>} */
  var tags = [];
  var i = 1;
  while (i < lines.length) {
    // Skip comments
    if (shaka.hls.Utils.isComment(lines[i])) {
      i += 1;
      continue;
    }

    var tag = this.parseTag_(lines[i]);

    if (shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS
                                    .indexOf(tag.name) >= 0) {
      playlistType = shaka.hls.PlaylistType.MEDIA;
    } else if (shaka.hls.ManifestTextParser.SEGMENT_TAGS
                                           .indexOf(tag.name) >= 0) {
      if (playlistType != shaka.hls.PlaylistType.MEDIA) {
        // Only media playlist should contain segment tags
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
      }

      var segmentsData = lines.splice(i, lines.length - i);
      var segments = this.parseSegments_(segmentsData);
      return new shaka.hls.Playlist(uri, playlistType, tags, segments);
    }

    tags.push(tag);
    i += 1;

    // EXT-X-STREAM-INF tag is followed by a uri of a media playlist.
    // Add uri to the tag object.
    if (tag.name == 'EXT-X-STREAM-INF') {
      var tagUri = new shaka.hls.Attribute('URI', lines[i]);
      tag.addAttribute(tagUri);
      i += 1;
    }
  }

  return new shaka.hls.Playlist(uri, playlistType, tags);
};


/**
 * Parses an array of strings into an HLS Segment objects.
 *
 * @param {!Array.<string>} lines
 * @return {!Array.<shaka.hls.Segment>}
 * @private
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.prototype.parseSegments_ = function(lines) {
  var segments = [];
  var tags = [];
  lines.forEach(function(line) {
    if (/^(#EXT)/.test(line)) {
      var tag = this.parseTag_(line);
      tags.push(tag);
    } else if (shaka.hls.Utils.isComment(line)) {
      // Skip comments
      return;
    } else {
      var uri = line.trim();
      // Uri appears after all the tags describing the segment.
      var segment = new shaka.hls.Segment(uri, tags);
      segments.push(segment);
      tags = [];
    }
  }.bind(this));

  return segments;
};


/**
 * Parses a string into an HLS Tag object while tracking what id to use next.
 *
 * @param {!string} word
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
 * @param {!string} word
 * @return {!shaka.hls.Tag}
 * @throws {shaka.util.Error}
 */
shaka.hls.ManifestTextParser.parseTag = function(id, word) {
  /* HLS tags start with '#EXT'. A tag can have a set of attributes
    (#EXT-<tagname>:<attribute list>) or a value (#EXT-<tagname>:<value>).
    Attributes' format is 'AttributeName=AttributeValue'.
    The parsing logic goes like this:
     1) Everything before ':' is a name (we ignore '#').
     2) Everything after should be parsed as attributes if it contains '='.
     3) Otherwise, this is a value.
     4) If there is no ":", it's a simple tag with no attributes and no value */
  var blocks = word.match(/^#(EXT[^:]*)(?::(.*))?$/);
  if (!blocks) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.INVALID_HLS_TAG);
  }
  var name = blocks[1];
  var data = blocks[2];
  var attributes = [];

  if (data && data.indexOf('=') >= 0) {
    var parser = new shaka.util.TextParser(data);
    var blockAttrs;

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
    var regex = /([^=]+)=(?:"([^"]*)"|([^",]*))(?:,|$)/g;
    while (blockAttrs = parser.readRegex(regex)) {
      var attrName = blockAttrs[1];
      var attrValue = blockAttrs[2] || blockAttrs[3];
      var attribute = new shaka.hls.Attribute(attrName, attrValue);
      attributes.push(attribute);
    }
  } else if (data) {
    return new shaka.hls.Tag(id, name, attributes, data);
  }

  return new shaka.hls.Tag(id, name, attributes);
};


/**
 * HLS tags that only appear on Media Playlists.
 * Used to determine a playlist type.
 *
 * @const {!Array<!string>}
 */
shaka.hls.ManifestTextParser.MEDIA_PLAYLIST_TAGS = [
  'EXT-X-TARGETDURATION',
  'EXT-X-MEDIA-SEQUENCE',
  'EXT-X-DISCONTINUITY-SEQUENCE',
  'EXT-X-PLAYLIST-TYPE',
  'EXT-X-MAP',
  'EXT-X-I-FRAMES-ONLY'
];


/**
 * HLS tags that only appear on Segments in a Media Playlists.
 * Used to determine the start of the segments info.
 *
 * @const {!Array<!string>}
 */
shaka.hls.ManifestTextParser.SEGMENT_TAGS = [
  'EXTINF',
  'EXT-X-BYTERANGE',
  'EXT-X-DISCONTINUITY',
  'EXT-X-PROGRAM-DATE-TIME',
  'EXT-X-KEY',
  'EXT-X-DATERANGE'
];
