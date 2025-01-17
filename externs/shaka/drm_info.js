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
 *   initData: !Uint8Array,
 *   initDataType: string,
 *   keyId: ?string
 * }}
 *
 * @description
 * Explicit initialization data, which override any initialization data in the
 * content. The initDataType values and the formats that they correspond to
 * are specified {@link https://bit.ly/EmeInitTypes here}.
 *
 * @property {!Uint8Array} initData
 *   Initialization data in the format indicated by initDataType.
 * @property {string} initDataType
 *   A string to indicate what format initData is in.
 * @property {?string} keyId
 *   The key Id that corresponds to this initData.
 *
 * @exportDoc
 */
shaka.extern.InitDataOverride;


/**
 * @typedef {{
 *   keySystem: string,
 *   encryptionScheme: string,
 *   keySystemUris: (Set<string>|undefined),
 *   licenseServerUri: string,
 *   distinctiveIdentifierRequired: boolean,
 *   persistentStateRequired: boolean,
 *   audioRobustness: string,
 *   videoRobustness: string,
 *   serverCertificate: Uint8Array,
 *   serverCertificateUri: string,
 *   sessionType: string,
 *   initData: Array<!shaka.extern.InitDataOverride>,
 *   keyIds: Set<string>
 * }}
 *
 * @description
 * DRM configuration for a single key system.
 *
 * @property {string} keySystem
 *   <i>Required.</i> <br>
 *   The key system, e.g., "com.widevine.alpha".
 * @property {string} encryptionScheme
 *   <i>Required.</i> <br>
 *   The encryption scheme, e.g., "cenc", "cbcs", "cbcs-1-9".
 * @property {(Set<string>|undefined)} keySystemUris
 *   <i>Optional.</i> <br>
 *   The key system uri, e.g., "skd://" for fairplay.
 * @property {string} licenseServerUri
 *   <i>Filled in by DRM config if missing.</i> <br>
 *   The license server URI.
 * @property {boolean} distinctiveIdentifierRequired
 *   <i>Defaults to false.  Can be filled in by advanced DRM config.</i> <br>
 *   True if the application requires the key system to support distinctive
 *   identifiers.
 * @property {boolean} persistentStateRequired
 *   <i>Defaults to false.  Can be filled in by advanced DRM config.</i> <br>
 *   True if the application requires the key system to support persistent
 *   state, e.g., for persistent license storage.
 * @property {string} sessionType
 *   <i>Defaults to 'temporary' if Shaka wasn't initiated for storage.
 *   Can be filled in by advanced DRM config sessionType parameter.</i> <br>
 * @property {string} audioRobustness
 *   <i>Defaults to '', e.g., no specific robustness required.  Can be filled in
 *   by advanced DRM config.</i> <br>
 *   A key-system-specific string that specifies a required security level.
 * @property {string} videoRobustness
 *   <i>Defaults to '', e.g., no specific robustness required.  Can be filled in
 *   by advanced DRM config.</i> <br>
 *   A key-system-specific string that specifies a required security level.
 * @property {Uint8Array} serverCertificate
 *   <i>Defaults to null, e.g., certificate will be requested from the license
 *   server if required.  Can be filled in by advanced DRM config.</i> <br>
 *   A key-system-specific server certificate used to encrypt license requests.
 *   Its use is optional and is meant as an optimization to avoid a round-trip
 *   to request a certificate.
 * @property {string} serverCertificateUri
 *   <i>Defaults to '', e.g., server certificate will be requested from the
 *   given URI if serverCertificate is not provided. Can be filled in by
 *   advanced DRM config.</i>
 * @property {Array<!shaka.extern.InitDataOverride>} initData
 *   <i>Defaults to [], e.g., no override.</i> <br>
 *   A list of initialization data which override any initialization data found
 *   in the content.  See also shaka.extern.InitDataOverride.
 * @property {Set<string>} keyIds
 *   <i>Defaults to the empty Set</i> <br>
 *   If not empty, contains the default key IDs for this key system, as
 *   lowercase hex strings.
 * @exportDoc
 */
shaka.extern.DrmInfo;
