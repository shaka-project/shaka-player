/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for CMCD data.
 * @see https://github.com/shaka-project/shaka-player/issues/3619
 * @see https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5004-final.pdf
 *
 * @externs
 */

/**
 * @typedef {{
 *   br: (number|undefined),
 *   d: (number|undefined),
 *   ot: (string|undefined),
 *   tb: (number|undefined),
 *   bl: (number|undefined),
 *   dl: (number|undefined),
 *   mtp: (number|undefined),
 *   nor: (string|undefined),
 *   nrr: (string|undefined),
 *   su: (boolean|undefined),
 *   cid: (string|undefined),
 *   pr: (number|undefined),
 *   sf: (string|undefined),
 *   sid: (string|undefined),
 *   st: (string|undefined),
 *   v: (number|undefined),
 *   bs: (boolean|undefined),
 *   rtp: (number|undefined),
 *   msd: (number|undefined),
 *   ltc: (number|undefined),
 *   bg: (boolean|undefined),
 *   sn: (number|undefined),
 *   cmsds: (string|undefined),
 *   cmsdd: (string|undefined),
 *   ttfb: (number|undefined),
 *   ttlb: (number|undefined),
 *   rc: (number|undefined),
 *   url: (string|undefined),
 *   ts: (number|undefined),
 * }}
 *
 * @description
 *   Client Media Common Data (CMCD) data.
 *
 * @property {number} br
 *   The encoded bitrate of the audio or video object being requested. This may
 *   not be known precisely by the player; however, it MAY be estimated based
 *   upon playlist/manifest declarations. If the playlist declares both peak and
 *   average bitrate values, the peak value should be transmitted.
 *
 * @property {number} d
 *   The playback duration in milliseconds of the object being requested. If a
 *   partial segment is being requested, then this value MUST indicate the
 *   playback duration of that part and not that of its parent segment. This
 *   value can be an approximation of the estimated duration if the explicit
 *   value is not known.
 *
 * @property {string} ot
 *   The media type of the current object being requested:
 *   - `m` = text file, such as a manifest or playlist
 *   - `a` = audio only
 *   - `v` = video only
 *   - `av` = muxed audio and video
 *   - `i` = init segment
 *   - `c` = caption or subtitle
 *   - `tt` = ISOBMFF timed text track
 *   - `k` = cryptographic key, license or certificate.
 *   - `o` = other
 *
 *   If the object type being requested is unknown, then this key MUST NOT be
 *   used.
 *
 * @property {number} tb
 *   The highest bitrate rendition in the manifest or playlist that the client
 *   is allowed to play, given current codec, licensing and sizing constraints.
 *
 * @property {number} bl
 *   The buffer length associated with the media object being requested. This
 *   value MUST be rounded to the nearest 100 ms. This key SHOULD only be sent
 *   with an object type of ‘a’, ‘v’ or ‘av’.
 *
 * @property {number} dl
 *   Deadline from the request time until the first sample of this
 *   Segment/Object needs to be available in order to not create a buffer
 *   underrun or any other playback problems. This value MUST be rounded to the
 *   nearest 100ms. For a playback rate of 1, this may be equivalent to the
 *   player’s remaining buffer length.
 *
 * @property {number} mtp
 *   The throughput between client and server, as measured by the client and
 *   MUST be rounded to the nearest 100 kbps. This value, however derived,
 *   SHOULD be the value that the client is using to make its next Adaptive
 *   Bitrate switching decision. If the client is connected to multiple
 *   servers concurrently, it must take care to report only the throughput
 *   measured against the receiving server. If the client has multiple
 *   concurrent connections to the server, then the intent is that this value
 *   communicates the aggregate throughput the client sees across all those
 *   connections.
 *
 * @property {string} nor
 *   Relative path of the next object to be requested. This can be used to
 *   trigger pre-fetching by the CDN. This MUST be a path relative to the
 *   current request. This string MUST be URLEncoded. The client SHOULD NOT
 *   depend upon any pre-fetch action being taken - it is merely a request for
 *   such a pre-fetch to take place.
 *
 * @property {string} nrr
 *   If the next request will be a partial object request, then this string
 *   denotes the byte range to be requested. If the ‘nor’ field is not set, then
 *   the object is assumed to match the object currently being requested. The
 *   client SHOULD NOT depend upon any pre-fetch action being taken – it is
 *   merely a request for such a pre-fetch to take place. Formatting is similar
 *   to the HTTP Range header, except that the unit MUST be ‘byte’, the ‘Range:’
 *   prefix is NOT required and specifying multiple ranges is NOT allowed. Valid
 *   combinations are:
 *
 *   - `"\<range-start\>-"`
 *   - `"\<range-start\>-\<range-end\>"`
 *   - `"-\<suffix-length\>"`
 *
 * @property {boolean} su
 *   Key is included without a value if the object is needed urgently due to
 *   startup, seeking or recovery after a buffer-empty event. The media SHOULD
 *   not be rendering when this request is made. This key MUST not be sent if it
 *   is FALSE.
 *
 * @property {string} cid
 *   A unique string identifying the current content. Maximum length is 64
 *   characters. This value is consistent across multiple different sessions and
 *   devices and is defined and updated at the discretion of the service
 *   provider.
 *
 * @property {number} pr
 *   The playback rate. `1` if real-time, `2` if double speed, `0` if not
 *   playing. SHOULD only be sent if not equal to `1`.
 *
 * @property {string} sf
 *   The streaming format that defines the current request.
 *
 *   - `d` = MPEG DASH
 *   - `h` = HTTP Live Streaming (HLS)
 *   - `s` = Smooth Streaming
 *   - `o` = other
 *
 *   If the streaming format being requested is unknown, then this key MUST NOT
 *   be used.
 *
 * @property {string} sid
 *   A GUID identifying the current playback session. A playback session
 *   typically ties together segments belonging to a single media asset. Maximum
 *   length is 64 characters. It is RECOMMENDED to conform to the UUID
 *   specification.
 *
 * @property {string} st
 *   Stream type
 *   - `v` = all segments are available – e.g., VOD
 *   - `l` = segments become available over time – e.g., LIVE
 *
 * @property {number} v
 *   The version of this specification used for interpreting the defined key
 *   names and values. If this key is omitted, the client and server MUST
 *   interpret the values as being defined by version 1. Client SHOULD omit this
 *   field if the version is 1.
 *
 * @property {boolean} bs
 *   Buffer starvation key is included without a value if the buffer was starved
 *   at some point between the prior request and this object request, resulting
 *   in the player being in a rebuffering state and the video or audio playback
 *   being stalled. This key MUST NOT be sent if the buffer was not starved
 *   since the prior request.
 *
 *   If the object type `ot` key is sent along with this key, then the `bs` key
 *   refers to the buffer associated with the particular object type. If no
 *   object type is communicated, then the buffer state applies to the current
 *   session.
 *
 * @property {number} rtp
 *   Requested maximum throughput
 *
 *   The requested maximum throughput that the client considers sufficient for
 *   delivery of the asset. Values MUST be rounded to the nearest 100kbps. For
 *   example, a client would indicate that the current segment, encoded at
 *   2Mbps, is to be delivered at no more than 10Mbps, by using rtp=10000.
 *
 *   Note: This can benefit clients by preventing buffer saturation through
 *   over-delivery and can also deliver a community benefit through fair-share
 *   delivery. The concept is that each client receives the throughput necessary
 *   for great performance, but no more. The CDN may not support the rtp
 *   feature.
 *
 * @property {number} msd
 *   The Media Start Delay represents in milliseconds the delay between the
 *   initiation of the playback request and the moment the first frame is
 *   rendered. This is sent only once when it is calculated.
 *
 * @property {number} ltc
 *   Live Stream Latency
 *
 *   The time delta between when a given media timestamp was made available at
 *   the origin and when it was rendered by the client. The accuracy of this
 *   estimate is dependent on synchronization between the packager and the
 *   player clocks.
 *
 *  @property {boolean} bg
 * Backgrounded
 *
 * All players in a session are currently in a state that is not visible to
 * the user due to a user interaction. This key SHOULD only be
 * sent if it is TRUE.
 *
 * @property {number} sn
 *  Sequence Number
 *
 *  A monotonically increasing integer to identify the sequence
 *  of a CMCD report to a target within a session.
 *  This MUST be reset to zero on the start of a new session-id.
 *  Sequence numbers increase independently per each combination
 *  of mode and target.
 *
 * @property {string} cmsds
 *   CMSD Static Header
 *
 *  Holds a `Base64 [base64]` encoded copy of the CMSD data received on
 *  the CMSD-Static response header.
 *  This key MUST only be used in RESPONSE mode.
 *
 * @property {string} cmsdd
 *   CMSD Dynamic Header
 *
 *   Holds a `Base64 [base64]` encoded copy of the CMSD data
 *   received on the CMSD-Dynamic response header.
 *   This key MUST only be used in RESPONSE mode.
 *
 * @property {number} ttfb
 * Elapsed time between when the request was first initiated (captured in ts)
 * and the time when the first byte of the response was received.
 * This value should only be reported if it is known.
 * Absence of this key does not indicate that the response was not received.
 *
 * @property {number} ttlb
 * Elapsed time between when the request was first initiated (captured in ts)
 * and the time the response body is fully received.
 * This value should only be reported if it is known.
 * Absence of this key does not indicate that the response was not
 * fully received.
 *
 * @property {number} rc
 *   Response code
 *
 *   The response code received when requesting a media object.
 *   In a redirect scenario, this would be the final response code received.
 *   A value of 0 SHOULD be used to indicate that a response was not received.
 *
 * @property {string} url
 *  url
 *
 *  The URL used to request the media object.
 *  This key MUST NOT be used with Request Modereporting mode #1.
 *  If the request is redirected, this key MUST report the initial
 *  requested URL.
 *
 * @property {number} ts
 *  Timestamp
 *
 *  The timestamp at which the associated event occurred,
 *  expressed as milliseconds since the UNIX epoch.
 *  When the event is a request for a media object the time
 *  SHOULD reference when the request was first initiated.
 */
var CmcdData;
