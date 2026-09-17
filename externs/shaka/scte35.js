/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @typedef {{
 *   tag: number,
 *   ptsTime: ?number,
 *   ptsOffset: ?number,
 * }}
 * @exportDoc
 */
shaka.extern.Scte35Component;

/**
 * A normalized splice command.  PTS and durations are in 90 kHz ticks, not
 * player presentation time.  Null means the field is absent.
 * @typedef {{
 *   type: number,
 *   spliceEventId: ?number,
 *   cancel: boolean,
 *   outOfNetwork: ?boolean,
 *   immediate: boolean,
 *   ptsTime: ?number,
 *   breakDuration: ?number,
 *   autoReturn: ?boolean,
 *   uniqueProgramId: ?number,
 *   availNum: ?number,
 *   availsExpected: ?number,
 *   components: !Array<shaka.extern.Scte35Component>,
 * }}
 * @exportDoc
 */
shaka.extern.Scte35Command;

/**
 * A normalized segmentation descriptor.  Duration and component offsets are
 * in 90 kHz ticks.  Unknown descriptors remain available in the original data.
 * @typedef {{
 *   segmentationEventId: number,
 *   cancel: boolean,
 *   duration: ?number,
 *   typeId: ?number,
 *   upidType: ?number,
 *   upid: ?string,
 *   segmentNum: ?number,
 *   segmentsExpected: ?number,
 *   subSegmentNum: ?number,
 *   subSegmentsExpected: ?number,
 *   deliveryNotRestricted: boolean,
 *   webDeliveryAllowed: ?boolean,
 *   noRegionalBlackout: ?boolean,
 *   archiveAllowed: ?boolean,
 *   deviceRestrictions: ?number,
 *   components: !Array<shaka.extern.Scte35Component>,
 * }}
 * @exportDoc
 */
shaka.extern.Scte35SegmentationDescriptor;

/**
 * Identifies an occurrence in its transport.  Transport IDs are independent
 * of splice and segmentation event IDs.
 * @typedef {{source: string, id: string, scope: string, schemeIdUri: string}}
 * @exportDoc
 */
shaka.extern.Scte35Origin;

/**
 * A SCTE-35 message on the player's presentation timeline.  startTime is in
 * seconds.  duration describes the transport's confirmed duration, if known;
 * plannedDuration is only an estimate.  Neither makes this message an ad.
 * kind is 'out', 'in', or 'cmd' for HLS, and 'message' otherwise.
 * status is 'parsed', 'unsupported', or 'invalid'.  Unsupported and invalid
 * messages retain their original data for applications to inspect.
 * data contains a complete binary section; xml contains the original XML.
 * upid values in descriptors are hexadecimal byte strings.
 * @typedef {{
 *   startTime: number,
 *   duration: ?number,
 *   plannedDuration: ?number,
 *   kind: string,
 *   origins: !Array<shaka.extern.Scte35Origin>,
 *   data: ?Uint8Array,
 *   rawData: ?string,
 *   xml: ?shaka.extern.xml.Node,
 *   status: string,
 *   ptsAdjustment: ?number,
 *   command: ?shaka.extern.Scte35Command,
 *   segmentationDescriptors: !Array<shaka.extern.Scte35SegmentationDescriptor>,
 * }}
 * @exportDoc
 */
shaka.extern.Scte35Event;
