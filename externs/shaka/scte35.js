/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {{
 *   schemeIdUri: string,
 *   startTime: number,
 *   endTime: number,
 *   id: string,
 *   source: string,
 *   kind: string,
 *   data: ?Uint8Array,
 *   node: ?shaka.extern.xml.Node,
 * }}
 *
 * @description
 * A SCTE-35 message placed on the presentation timeline.
 *
 * The player does not interpret the message.  It normalizes where the message
 * came from and when it applies, and hands the payload to the application
 * untouched, so that applications can decode only the parts they need.
 *
 * @property {string} schemeIdUri
 *   The SCTE-35 scheme the transport used to carry the message.
 * @property {number} startTime
 *   The presentation time (in seconds) the message applies to.
 * @property {number} endTime
 *   The presentation time (in seconds) the message stops applying.  Equal to
 *   startTime when the transport does not signal a duration.
 * @property {string} id
 *   The transport's identifier for this message.  It is independent of the
 *   splice and segmentation event IDs inside the payload.
 * @property {string} source
 *   Where the message was found: 'dash', 'hls' or 'emsg'.
 * @property {string} kind
 *   'out', 'in' or 'cmd' for HLS, matching the attribute that carried the
 *   payload.  The empty string for other sources.
 * @property {?Uint8Array} data
 *   The complete binary splice_info_section, decoded from base64 or
 *   hexadecimal when the transport used those.  Null when the message is
 *   only available as XML.
 * @property {?shaka.extern.xml.Node} node
 *   The original XML, for XML-native messages.  Null otherwise.
 * @exportDoc
 */
shaka.extern.Scte35Event;
