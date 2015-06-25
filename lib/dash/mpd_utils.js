/**
 * Copyright 2015 Google Inc.
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
 *
 * @fileoverview MPD processing utility functions.
 */

goog.provide('shaka.dash.MpdUtils');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');


/**
 * @namespace shaka.dash.MpdUtils
 * @summary A set of MPD processing utility functions.
 */


/**
 * Generates a set of SegmentReferences from a SegmentTemplate with a 'duration'
 * attribute.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} firstSegmentNumber The segment number (one-based) of the
 *     first SegmentReference to generate, relative to the start of the
 *     Representation's Period.
 * @param {number} numSegments The number of SegmentReferences to generate.
 * @return {Array.<!shaka.media.SegmentReference>} The SegmentReferences on
 *     success; otherwise, null.
 */
shaka.dash.MpdUtils.generateSegmentReferences = function(
    representation, firstSegmentNumber, numSegments) {
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);
  shaka.asserts.assert(firstSegmentNumber > 0);

  var segmentTemplate = representation.segmentTemplate;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = 0; i < numSegments; ++i) {
    // The current segment number (one-based), relative to the start of the
    // Representation's Period.
    var segmentNumber = i + firstSegmentNumber;

    var startTime = (segmentNumber - 1) * segmentTemplate.segmentDuration;
    var endTime = startTime + segmentTemplate.segmentDuration;

    var scaledStartTime = startTime / segmentTemplate.timescale;
    var scaledEndTime = endTime / segmentTemplate.timescale;

    // Compute the media URL template placeholder replacements. Note
    // that |segmentReplacement| may be zero.
    var segmentReplacement = (segmentNumber - 1) + segmentTemplate.startNumber;
    var timeReplacement = (segmentNumber - 1) * segmentTemplate.segmentDuration;

    // Generate the media URL.
    var mediaUrl = shaka.dash.MpdUtils.fillMediaUrlTemplate(
        representation, segmentReplacement, timeReplacement);
    if (!mediaUrl) {
      // An error has already been logged.
      return null;
    }

    references.push(
        new shaka.media.SegmentReference(
            scaledStartTime,
            scaledEndTime,
            0 /* startByte */,
            null /* endByte */,
            new goog.Uri(mediaUrl)));
  }

  return references;
};


/**
 * Fills a media URL template. Falls-back to the Representation's BaseURL if
 * the SegmentTemplate's media URL template is missing.
 *
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} number
 * @param {number} time
 * @return {goog.Uri} A URL on success; otherwise, return null.
 */
shaka.dash.MpdUtils.fillMediaUrlTemplate = function(
    representation, number, time) {
  shaka.asserts.assert(representation.segmentTemplate);
  if (!representation.segmentTemplate) return null;

  var urlTemplate = representation.segmentTemplate.mediaUrlTemplate;
  if (!urlTemplate) {
    shaka.log.warning(
        'The SegmentTemplate\'s media URL template is missing:',
        'using the Representation\'s BaseURL instead.',
        representation);
    return representation.baseUrl ?
           new goog.Uri(representation.baseUrl) :
           null;
  }

  var filledUrlTemplate = shaka.dash.MpdUtils.fillUrlTemplate(
      urlTemplate,
      representation.id,
      number,
      representation.bandwidth,
      time);

  if (!filledUrlTemplate) {
    // An error has already been logged.
    return null;
  }

  var mediaUrl = representation.baseUrl ?
                 representation.baseUrl.resolve(filledUrlTemplate) :
                 filledUrlTemplate;

  return mediaUrl;
};


/**
 * Fills a SegmentTemplate URL template.
 *
 * @see ISO/IEC 23009-1:2014 section 5.3.9.4.4
 *
 * @param {string} urlTemplate
 * @param {?string} representationId
 * @param {?number} number
 * @param {?number} bandwidth
 * @param {?number} time
 * @return {goog.Uri} A URL on success; otherwise, return null.
 */
shaka.dash.MpdUtils.fillUrlTemplate = function(
    urlTemplate, representationId, number, bandwidth, time) {
  /** @type {!Object.<string, ?number|?string>} */
  var valueTable = {
    'RepresentationID': representationId,
    'Number': number,
    'Bandwidth': bandwidth,
    'Time': time
  };

  var re = /\$(RepresentationID|Number|Bandwidth|Time)?(?:%0([0-9]+)d)?\$/g;
  var url = urlTemplate.replace(re, function(match, name, widthString) {
    if (match == '$$') {
      return '$';
    }

    var value = valueTable[name];
    shaka.asserts.assert(value !== undefined);

    // Note that |value| may be 0 or ''.
    if (value == null) {
      shaka.log.warning(
          'URL template does not have an available substitution for identifier',
          '"' + name + '":',
          urlTemplate);
      return match;
    }

    if (name == 'RepresentationID' && widthString) {
      shaka.log.warning(
          'URL template should not contain a width specifier for identifier',
          '"RepresentationID":',
          urlTemplate);
      widthString = undefined;
    }

    var valueString = value.toString();

    // Create padding string.
    var width = window.parseInt(widthString, 10) || 1;
    var paddingSize = Math.max(0, width - valueString.length);
    var padding = (new Array(paddingSize + 1)).join('0');

    return padding + valueString;
  });

  // The URL might contain illegal characters (e.g., '%').
  try {
    return new goog.Uri(url);
  } catch (exception) {
    if (exception instanceof URIError) {
      shaka.log.warning(
          'URL template contains an illegal character:', urlTemplate);
      return null;
    }
    throw exception;
  }
};

