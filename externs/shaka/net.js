/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @typedef {{
 *   maxAttempts: number,
 *   baseDelay: number,
 *   backoffFactor: number,
 *   fuzzFactor: number,
 *   timeout: number,
 *   stallTimeout: number,
 *   connectionTimeout: number
 * }}
 *
 * @description
 *   Parameters for retrying requests.
 *
 * @property {number} maxAttempts
 *   The maximum number of times the request should be attempted.
 * @property {number} baseDelay
 *   The delay before the first retry, in milliseconds.
 * @property {number} backoffFactor
 *   The multiplier for successive retry delays.
 * @property {number} fuzzFactor
 *   The maximum amount of fuzz to apply to each retry delay.
 *   For example, 0.5 means "between 50% below and 50% above the retry delay."
 * @property {number} timeout
 *   The request timeout, in milliseconds.  Zero means "unlimited".
 *   <i>Defaults to 30000 milliseconds.</i>
 * @property {number} stallTimeout
 *   The request stall timeout, in milliseconds.  Zero means "unlimited".
 *   <i>Defaults to 5000 milliseconds.</i>
 * @property {number} connectionTimeout
 *   The request connection timeout, in milliseconds.  Zero means "unlimited".
 *   <i>Defaults to 10000 milliseconds.</i>
 *
 * @tutorial network-and-buffering-config
 *
 * @exportDoc
 */
shaka.extern.RetryParameters;


/**
 * @typedef {{
 *   uris: !Array.<string>,
 *   method: string,
 *   body: ?BufferSource,
 *   headers: !Object.<string, string>,
 *   allowCrossSiteCredentials: boolean,
 *   retryParameters: !shaka.extern.RetryParameters,
 *   licenseRequestType: ?string,
 *   sessionId: ?string,
 *   drmInfo: ?shaka.extern.DrmInfo,
 *   initData: ?Uint8Array,
 *   initDataType: ?string,
 *   streamDataCallback: ?function(BufferSource):!Promise
 * }}
 *
 * @description
 * Defines a network request.  This is passed to one or more request filters
 * that may alter the request, then it is passed to a scheme plugin which
 * performs the actual operation.
 *
 * @property {!Array.<string>} uris
 *   An array of URIs to attempt.  They will be tried in the order they are
 *   given.
 * @property {string} method
 *   The HTTP method to use for the request.
 * @property {?BufferSource} body
 *   The body of the request.
 * @property {!Object.<string, string>} headers
 *   A mapping of headers for the request.  e.g.: {'HEADER': 'VALUE'}
 * @property {boolean} allowCrossSiteCredentials
 *   Make requests with credentials.  This will allow cookies in cross-site
 *   requests.  See {@link https://bit.ly/CorsCred}.
 * @property {!shaka.extern.RetryParameters} retryParameters
 *   An object used to define how often to make retries.
 * @property {?string} licenseRequestType
 *   If this is a LICENSE request, this field contains the type of license
 *   request it is (not the type of license).  This is the |messageType| field
 *   of the EME message.  For example, this could be 'license-request' or
 *   'license-renewal'.
 * @property {?string} sessionId
 *   If this is a LICENSE request, this field contains the session ID of the
 *   EME session that made the request.
 * @property {?shaka.extern.DrmInfo} drmInfo
 *   If this is a LICENSE request, this field contains the DRM info used to
 *   initialize EME.
 * @property {?Uint8Array} initData
 *   If this is a LICENSE request, this field contains the initData info used
 *   to initialize EME.
 * @property {?string} initDataType
 *   If this is a LICENSE request, this field contains the initDataType info
 *   used to initialize EME.
 * @property {?function(BufferSource):!Promise} streamDataCallback
 *   A callback function to handle the chunked data of the ReadableStream.
 * @exportDoc
 */
shaka.extern.Request;


/**
 * @typedef {{
 *   uri: string,
 *   originalUri: string,
 *   data: BufferSource,
 *   status: (number|undefined),
 *   headers: !Object.<string, string>,
 *   timeMs: (number|undefined),
 *   fromCache: (boolean|undefined)
 * }}
 *
 * @description
 * Defines a response object.  This includes the response data and header info.
 * This is given back from the scheme plugin.  This is passed to a response
 * filter before being returned from the request call.
 *
 * @property {string} uri
 *   The URI which was loaded.  Request filters and server redirects can cause
 *   this to be different from the original request URIs.
 * @property {string} originalUri
 *   The original URI passed to the browser for networking. This is before any
 *   redirects, but after request filters are executed.
 * @property {BufferSource} data
 *   The body of the response.
 * @property {(number|undefined)} status
 *   The response HTTP status code.
 * @property {!Object.<string, string>} headers
 *   A map of response headers, if supported by the underlying protocol.
 *   All keys should be lowercased.
 *   For HTTP/HTTPS, may not be available cross-origin.
 * @property {(number|undefined)} timeMs
 *   Optional.  The time it took to get the response, in milliseconds.  If not
 *   given, NetworkingEngine will calculate it using Date.now.
 * @property {(boolean|undefined)} fromCache
 *   Optional. If true, this response was from a cache and should be ignored
 *   for bandwidth estimation.
 *
 * @exportDoc
 */
shaka.extern.Response;


/**
 * @typedef {!function(string,
 *                     shaka.extern.Request,
 *                     shaka.net.NetworkingEngine.RequestType,
 *                     shaka.extern.ProgressUpdated,
 *                     shaka.extern.HeadersReceived):
 *     !shaka.extern.IAbortableOperation.<shaka.extern.Response>}
 * @description
 * Defines a plugin that handles a specific scheme.
 *
 * The functions accepts four parameters, uri string, request, request type,
 * a progressUpdated function, and a headersReceived function.  The
 * progressUpdated and headersReceived functions can be ignored by plugins that
 * do not have this information, but it will always be provided by
 * NetworkingEngine.
 *
 * @exportDoc
 */
shaka.extern.SchemePlugin;


/**
 * @typedef {function(number, number, number)}
 *
 * @description
 * A callback function to handle progress event through networking engine in
 * player.
 * The first argument is a number for duration in milliseconds, that the request
 * took to complete.
 * The second argument is the total number of bytes downloaded during that
 * time.
 * The third argument is the number of bytes remaining to be loaded in a
 * segment.
 * @exportDoc
 */
shaka.extern.ProgressUpdated;


/**
 * @typedef {function(!Object.<string, string>)}
 *
 * @description
 * A callback function to handle headers received events through networking
 * engine in player.
 * The first argument is the headers object of the response.
 */
shaka.extern.HeadersReceived;


/**
 * @typedef {{
 *   type: (shaka.net.NetworkingEngine.AdvancedRequestType|undefined),
 *   stream: (shaka.extern.Stream|undefined),
 *   segment: (shaka.media.SegmentReference|undefined)
 * }}
 *
 * @description
 * Defines contextual data about a request
 *
 * @property {shaka.net.NetworkingEngine.AdvancedRequestType=} type
 *   The advanced type
 * @property {shaka.extern.Stream=} stream
 *   The duration of the segment in seconds
 * @property {shaka.media.SegmentReference=} segment
 *   The request's segment reference
 * @exportDoc
 */
shaka.extern.RequestContext;


/**
 * Defines a filter for requests.  This filter takes the request and modifies
 * it before it is sent to the scheme plugin.
 * The RequestType describes the basic type of the request (manifest, segment,
 * etc). The optional RequestContext will be provided where applicable to
 * provide additional information about the request. A request filter can run
 * asynchronously by returning a promise; in this case, the request will not be
 * sent until the promise is resolved.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shaka.extern.Request,
 *                     shaka.extern.RequestContext=):
 *           (Promise|undefined)}
 * @exportDoc
 */
shaka.extern.RequestFilter;


/**
 * Defines a filter for responses.  This filter takes the response and modifies
 * it before it is returned.
 * The RequestType describes the basic type of the request (manifest, segment,
 * etc). The optional RequestContext will be provided where applicable to
 * provide additional information about the request. A response filter can run
 * asynchronously by returning a promise.
 *
 * @typedef {!function(shaka.net.NetworkingEngine.RequestType,
 *                     shaka.extern.Response,
 *                     shaka.extern.RequestContext=):
 *            (Promise|undefined)}
 * @exportDoc
 */
shaka.extern.ResponseFilter;
