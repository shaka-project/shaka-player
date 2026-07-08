/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * Parses binary media data and returns the metadata frames it contains.
 *
 * A metadata parser is responsible for extracting tag information from a
 * specific container/codec format (e.g. ID3v2, Vorbis comments, MP4 ILST).
 * Parsers are registered with {@link shaka.metadata.Metadata} via
 * {@link shaka.metadata.Metadata.registerParserByMime} and are looked up at
 * runtime by MIME type.
 *
 * <h3>Key naming convention</h3>
 * Every {@link shaka.extern.MetadataFrame} produced by a parser MUST use the
 * corresponding <strong>ID3v2.4 four-character frame ID</strong> as its
 * {@code key} whenever one exists for the concept being described.  This
 * ensures that consumers can work with a single, format-agnostic vocabulary
 * regardless of the underlying container.
 *
 * Examples of the expected mapping:
 * <ul>
 *   <li>Track title  → {@code TIT2}</li>
 *   <li>Lead artist  → {@code TPE1}</li>
 *   <li>Album name   → {@code TALB}</li>
 *   <li>Genre        → {@code TCON}</li>
 *   <li>Recording year / date → {@code TDRC}</li>
 *   <li>Track number → {@code TRCK}</li>
 *   <li>Disc number  → {@code TPOS}</li>
 *   <li>Comment      → {@code COMM}</li>
 *   <li>Attached picture / cover art → {@code APIC}</li>
 * </ul>
 *
 * If no ID3v2.4 equivalent exists for a given tag (e.g. a vendor-specific
 * freeform field), the parser MAY use any non-empty string as the key, but
 * MUST NOT shadow a well-known ID3v2.4 frame ID with unrelated data.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.MetadataParser = class {
  constructor() {}

  /**
   * Parses {@code data} and returns every metadata frame found in it.
   *
   * Implementations MUST:
   * <ul>
   *   <li>Return an empty array (never {@code null}) when no frames are
   *       found or the data is not recognised.</li>
   *   <li>Not throw; all errors should be swallowed and result in an empty
   *       or partial return value.</li>
   *   <li>Use ID3v2.4 four-character frame IDs as {@code key} values
   *       wherever a mapping exists (see class-level documentation).</li>
   * </ul>
   *
   * @param {!Uint8Array} data  Raw bytes of the media segment or file.
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @exportDoc
   */
  parse(data) {}
};


/**
 * A factory function that creates a {@link shaka.extern.MetadataParser}
 * instance.
 *
 * @typedef {function():!shaka.extern.MetadataParser}
 * @exportDoc
 */
shaka.extern.MetadataParser.Factory;
