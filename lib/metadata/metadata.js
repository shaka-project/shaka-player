/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.Metadata');


/**
 * @export
 */
shaka.metadata.Metadata = class {
  /**
   * Returns all metadata frames found in the media data for the given MIME
   * type.
   *
   * The method invokes every parser factory that has been registered for
   * {@code mimeType} via {@link shaka.metadata.Metadata.registerParserByMime},
   * collects all returned frames, and deduplicates them so that when multiple
   * frames share the same {@code key} only the first occurrence is kept.
   *
   * The same MIME type may have more than one parser registered (e.g. both an
   * ID3v2 and an ID3v1 parser for {@code audio/mpeg}).  All registered parsers
   * are run in registration order and their results are concatenated before
   * deduplication.
   *
   * @param {!Uint8Array} data
   * @param {string} mimeType
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @export
   */
  static getMetadataFrames(data, mimeType) {
    const factories =
        shaka.metadata.Metadata.parsersByMime_.get(mimeType) || [];

    const frames = [];
    for (const factory of factories) {
      frames.push(...factory().parse(data));
    }

    // Deduplicate: keep only the first frame for each key.
    const seen = new Set();
    const result = [];
    for (const f of frames) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        result.push(f);
      }
    }

    return result;
  }

  /**
   * Returns {@code true} when at least one parser has been registered for
   * {@code mimeType}.
   *
   * @param {string} mimeType
   * @return {boolean}
   * @export
   */
  static supports(mimeType) {
    const factories = shaka.metadata.Metadata.parsersByMime_.get(mimeType);
    return factories != null && factories.length > 0;
  }

  /**
   * Registers a metadata parser factory for a given MIME type.
   *
   * The same MIME type may be registered more than once; each additional call
   * appends the factory to the list of parsers for that MIME type.  When
   * {@link shaka.metadata.Metadata.getMetadataFrames} is called, all
   * registered parsers for the MIME type are invoked in registration order and
   * their frames are merged (with first-occurrence-wins deduplication on
   * {@code key}).
   *
   * @param {string} mimeType
   * @param {shaka.extern.MetadataParser.Factory} parserFactory
   * @export
   */
  static registerParserByMime(mimeType, parserFactory) {
    const map = shaka.metadata.Metadata.parsersByMime_;
    if (!map.has(mimeType)) {
      map.set(mimeType, []);
    }
    map.get(mimeType).push(parserFactory);
  }

  /**
   * Unregisters all parser factories that have been registered for the given
   * MIME type.
   *
   * @param {string} mimeType
   * @export
   */
  static unregisterParserByMime(mimeType) {
    shaka.metadata.Metadata.parsersByMime_.delete(mimeType);
  }
};


/**
 * Maps each MIME type to the ordered list of parser factories registered for
 * it.  A single MIME type may have multiple factories (e.g. ID3v2 + ID3v1 for
 * {@code audio/mpeg}).
 *
 * @type {!Map<string, !Array<shaka.extern.MetadataParser.Factory>>}
 * @private
 */
shaka.metadata.Metadata.parsersByMime_ = new Map();
