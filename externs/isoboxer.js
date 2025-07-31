/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for codem-isoboxer library.
 * @externs
 */


/**
 * @typedef {{
 *   Utils: !ISOBoxerUtils,
 *   parseBuffer: function(!(ArrayBuffer|ArrayBufferView)):!ISOFile,
 *   createBox: function(string, !ISOBoxer, boolean=):!ISOBoxer,
 *   createFullBox: function(string, !ISOBoxer, ?ISOBoxer=):!ISOBoxer,
 *   addBoxProcessor: function(string, function()):!ISOBoxer,
 *   createFile: function():!ISOFile,
 * }}
 * @property {!ISOBoxerUtils} Utils
 * @property {function(!(ArrayBuffer|ArrayBufferView)):!ISOFile} parseBuffer
 * @property {function(string, !ISOBoxer, boolean=):!ISOBoxer} createBox
 * @property {function(string, !ISOBoxer, ?ISOBoxer=):!ISOBoxer} createFullBox
 * @property {function(string, function()):!ISOBoxer} addBoxProcessor
 * @property {function():!ISOFile} createFile
 * @const
 */
var ISOBoxer;


/**
 * @typedef {{
 *   write: function():!ArrayBuffer,
 *   fetch: function(string):!ISOBox
 * }}
 * @property {function():!ArrayBuffer} write
 * @property {function(string):!ISOBox} fetch
 * @const
 */
var ISOFile;


/**
 * @typedef {{
 *   appendBox: function(!ISOBoxer, !ISOBoxer):!ISOBox
 * }}
 * @const
 */
var ISOBoxerUtils;


/**
 * @typedef {{
 *   _parsing: boolean,
 *   type: string,
 *   size: number,
 *   _parent: ISOBox,
 *   boxes: !Array<!ISOBox>,
 *   entry: !Array<!Object>,
 *   version: !number,
 *   flags: !number,
 *   sample_count: !number,
 *   default_sample_info_size: !number,
 *   entry_count: !number,
 *   getLength: function():number,
 *   _procFullBox: function(),
 *   _procField: function(!string, !string, !number),
 *   _procFieldArray: function(!string, !number, !string, !number),
 *   _procEntries: function(!string, !number, !function(!ISOEntry)),
 *   _procEntryField: function(!ISOBox, !string, !string, !number),
 *   _procSubEntries: function(!ISOBox, !string, !number, !function(!ISOEntry)),
 *   major_brand: string,
 *   minor_version: number,
 *   compatible_brands: Array<string>,
 *   _data: Array<number>,
 *   creation_time: number,
 *   modification_time: number,
 *   timescale: number,
 *   duration: number,
 *   rate: number,
 *   volume: number,
 *   reserved1: number,
 *   reserved2: (Array<number>|number),
 *   matrix: Array<number>,
 *   pre_defined: (Array<number>|number),
 *   next_track_ID: number,
 *   track_ID: number,
 *   layer: number,
 *   alternate_group: number,
 *   reserved3: number,
 *   width: number,
 *   height: number,
 *   language: string,
 *   handler_type: string,
 *   name: string,
 *   reserved: Array<number>,
 *   graphicsmode: number,
 *   opcolor: Array<number>,
 *   balance: number,
 *   entries: Array<!ISOEntry>,
 *   location: string,
 *   data_reference_index: number,
 *   pre_defined1: number,
 *   pre_defined2: Array<number>,
 *   pre_defined3: number,
 *   horizresolution: number,
 *   vertresolution: number,
 *   frame_count: number,
 *   compressorname: Array<number>,
 *   depth: number,
 *   config: Uint8Array,
 *   channelcount: number,
 *   samplesize: number,
 *   reserved_3: number,
 *   samplerate: number,
 *   esds: Uint8Array,
 *   data_format: number,
 *   scheme_type: number,
 *   scheme_version: number,
 *   default_IsEncrypted: number,
 *   default_IV_size: number,
 *   default_KID: Array<number>,
 *   default_sample_description_index: number,
 *   default_sample_duration: number,
 *   default_sample_size: number,
 *   default_sample_flags: number,
 *   baseMediaDecodeTime: number,
 *   usertype: (string|null|undefined),
 *   offset: Array<number>,
 *   sample_info_size: Array<number>,
 *   data_offset: number
 * }}
 * @property {boolean} _parsing
 * @property {string} type
 * @property {number} size
 * @property {ISOBox} _parent
 * @property {!Array<!ISOBox>} boxes
 * @property {!Array<!ISOEntry>} entry
 * @property {!number} version
 * @property {!number} flags
 * @property {!number} sample_count
 * @property {!number} default_sample_info_size
 * @property {!number} entry_count
 * @property {function()} _procFullBox
 * @property {function(!string, !string, !number)} _procField
 * @property {function(!string, !number, !string, !number)} _procFieldArray
 * @property {function(!string, !number, !function(!ISOEntry))} _procEntries
 * @property {function(!ISOBox, !string, !string, !number)} _procEntryField
 * @property {function(!ISOBox, !string, !number, !function(!ISOEntry))
 *           } _procSubEntries
 * @property {string} major_brand
 * @property {number} minor_version
 * @property {Array<string>} compatible_brands
 * @property {Array<number>} _data
 * @property {number} creation_time
 * @property {number} modification_time
 * @property {number} timescale
 * @property {number} duration
 * @property {number} rate
 * @property {number} volume
 * @property {number} reserved1
 * @property {Array<number>|number} reserved2
 * @property {Array<number>} matrix
 * @property {Array<number>|number} pre_defined
 * @property {number} next_track_ID
 * @property {number} track_ID
 * @property {number} layer
 * @property {number} alternate_group
 * @property {number} reserved3
 * @property {number} width
 * @property {number} height
 * @property {string} language
 * @property {string} handler_type
 * @property {string} name
 * @property {Array<number>} reserved
 * @property {number} graphicsmode
 * @property {Array<number>} opcolor
 * @property {number} balance
 * @property {Array<!ISOEntry>} entries
 * @property {string} location
 * @property {number} data_reference_index
 * @property {number} pre_defined1
 * @property {Array<number>} pre_defined2
 * @property {number} pre_defined3
 * @property {number} horizresolution
 * @property {number} vertresolution
 * @property {number} frame_count
 * @property {number} compressorname
 * @property {number} depth
 * @property {Uint8Array} config
 * @property {number} channelcount
 * @property {number} samplesize
 * @property {number} reserved_3
 * @property {number} samplerate
 * @property {Uint8Array} esds
 * @property {number} data_format
 * @property {number} scheme_type
 * @property {number} scheme_version
 * @property {number} default_IsEncrypted
 * @property {number} default_IV_size
 * @property {Array<number>} default_KID
 * @property {number} default_sample_description_index
 * @property {number} default_sample_duration
 * @property {number} default_sample_size
 * @property {number} default_sample_flags
 * @property {number} baseMediaDecodeTime
 * @property {string|null|undefined} usertype
 * @property {Array<number>} offset
 * @property {Array<number>} sample_info_size
 * @property {number} data_offset
 * @const
 */
var ISOBox;


/**
 * @typedef {{
 *   NumberOfEntries: number
 * }}
 * @property {number} NumberOfEntries
 * @const
 */
var ISOEntry;
