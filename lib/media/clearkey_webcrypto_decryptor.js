/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ClearKeyWebCryptoDecryptor');

goog.require('goog.asserts');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @implements {shaka.util.IReleasable}
 */
shaka.media.ClearKeyWebCryptoDecryptor = class {
  constructor() {
    /** @private {?shaka.extern.DrmInfo} */
    this.drmInfo_ = null;

    /** @private {!Map<string, {cbc:!CryptoKey, ctr:!CryptoKey}>} */
    this.keyMap_ = new Map();

    /** @private {?Uint8Array} */
    this.lastInit_ = null;
  }

  /**
   * @param {!BufferSource} data
   * @param {boolean} isInit
   * @param {!shaka.extern.DrmInfo} drmInfo
   * @return {!Promise<!Uint8Array>}
   */
  async decrypt(data, isInit, drmInfo) {
    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);

    if (isInit) {
      this.lastInit_ = uint8ArrayData;
      return this.stripEncryptionFromInit_(uint8ArrayData);
    }

    if (!this.lastInit_) {
      return uint8ArrayData;
    }

    if (this.drmInfo_ !== drmInfo) {
      this.drmInfo_ = drmInfo;
      this.keyMap_ = await this.buildKeyMap_(this.drmInfo_);
    }

    return this.decryptSegment_(uint8ArrayData, this.lastInit_);
  }

  /**
   * @override
   */
  release() {
    this.drmInfo_ = null;
    this.keyMap_.clear();
    this.lastInit_ = null;
  }

  /**
   * Extracts a Map<keyIdHex, {cbc, ctr}> from a ClearKey DrmInfo whose
   * licenseServerUri is a data:application/json;base64,<JWK-set> URI.
   *
   * @param {!shaka.extern.DrmInfo} drmInfo
   * @return {!Promise<!Map<string, {cbc:!CryptoKey, ctr:!CryptoKey}>>}
   * @private
   */
  async buildKeyMap_(drmInfo) {
    /** @type {!Map<string, {cbc:!CryptoKey, ctr:!CryptoKey}>} */
    const keyMap = new Map();

    if (!drmInfo.clearKeys) {
      return keyMap;
    }

    const results = await Promise.all(
        [...drmInfo.clearKeys.entries()].map(([kid, key]) => {
          const keyBytes = shaka.util.Uint8ArrayUtils.fromBase64(key);
          const kidBytes = shaka.util.Uint8ArrayUtils.fromBase64(kid);
          return Promise.all([
            crypto.subtle.importKey(
                'raw', keyBytes, {name: 'AES-CBC'},
                /* extractable= */ false, ['decrypt', 'encrypt']),
            crypto.subtle.importKey(
                'raw', keyBytes, {name: 'AES-CTR'},
                /* extractable= */ false, ['decrypt']),
          ]).then(([cbc, ctr]) => ({
            kidHex: shaka.util.Uint8ArrayUtils.toHex(kidBytes), cbc, ctr,
          }));
        }),
    );

    for (const {kidHex, cbc, ctr} of results) {
      keyMap.set(kidHex, {cbc, ctr});
    }
    return keyMap;
  }

  /**
   * Full segment decryption pipeline.
   *
   * @param {!Uint8Array} segmentData
   * @param {!Uint8Array} initData
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  async decryptSegment_(segmentData, initData) {
    const trackInfos = this.parseInitSegment_(initData);
    const segInfo = this.parseMediaSegment_(segmentData, trackInfos);

    const fragmentPromises = segInfo.fragments.map((fragment) => {
      const initInfo = trackInfos.get(fragment.trackId) ||
          trackInfos.values().next().value;
      return this.decryptFragment_(fragment, segmentData, initInfo);
    });

    const decryptedFragments = await Promise.all(fragmentPromises);
    const outputChunks = [
      segmentData.slice(0, segInfo.firstFragmentOffset),
      ...decryptedFragments,
    ];
    return shaka.util.Uint8ArrayUtils.concat(...outputChunks);
  }

  /**
   * Rewrites the init segment to strip encryption signalling:
   * encv/enca -> original codec fourcc (from frma), sinf -> free.
   * MSE will then accept the plain decrypted samples without complaint.
   *
   * @param {!Uint8Array} initData
   * @return {!Uint8Array}
   * @private
   */
  stripEncryptionFromInit_(initData) {
    const initSegment = shaka.util.BufferUtils.toUint8(initData).slice();
    const view = shaka.util.BufferUtils.toDataView(initSegment);

    const modifications = [];
    let currentEncBoxStart = -1;

    const freeBox = (box) => {
      modifications.push(() => {
        view.setUint32(box.start + 4,
            shaka.media.ClearKeyWebCryptoDecryptor.BOX_TYPE_FREE_,
            /* littleEndian= */ false);
        initSegment.fill(0, box.start + 8, box.start + box.size);
      });
    };

    new shaka.util.Mp4Parser()
        .boxes([
          'moov',
          'trak',
          'mdia',
          'minf',
          'stbl',
        ], shaka.util.Mp4Parser.children)
        .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
        .box('encv', (box) => {
          currentEncBoxStart = box.start;
          shaka.util.Mp4Parser.visualSampleEntry(box);
        })
        .box('enca', (box) => {
          currentEncBoxStart = box.start;
          shaka.util.Mp4Parser.audioSampleEntry(box);
        })
        .box('sinf', (box) => {
          freeBox(box);
          shaka.util.Mp4Parser.children(box);
        })
        .box('frma', (box) => {
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          const targetEncStart = currentEncBoxStart;
          if (targetEncStart !== -1 && codec) {
            modifications.push(() => {
              view.setUint8(targetEncStart + 4, codec.charCodeAt(0));
              view.setUint8(targetEncStart + 5, codec.charCodeAt(1));
              view.setUint8(targetEncStart + 6, codec.charCodeAt(2));
              view.setUint8(targetEncStart + 7, codec.charCodeAt(3));
            });
          }
        })
        .fullBox('sgpd', freeBox)
        .box('pssh', freeBox)
        .parse(initSegment, /* partialOkay= */ true);

    for (const mod of modifications) {
      mod();
    }

    return initSegment;
  }

  /**
   * @param {!Uint8Array} initData
   * @return {!Map<number, !shaka.media.ClearKeyWebCryptoDecryptor.InitInfo>}
   * @private
   */
  parseInitSegment_(initData) {
    const trackInfos = new Map();
    let currentTrackId = 0;

    const Mp4Parser = shaka.util.Mp4Parser;
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;

    new Mp4Parser()
        .boxes([
          'moov',
          'mdia',
          'minf',
          'stbl',
        ], Mp4Parser.children)
        .box('trak', (box) => {
          currentTrackId = 0;
          Mp4Parser.children(box);
        })
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsed = Mp4BoxParsers.parseTKHD(box.reader, box.version);
          currentTrackId = parsed.trackId;
          trackInfos.getOrInsert(currentTrackId, {
            defaultKID: '',
            encryptionScheme: 'cenc',
            defaultIVSize: 8,
            defaultConstantIV: null,
            defaultCryptByteBlock: 0,
            defaultSkipByteBlock: 0,
          });
        })
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('enca', Mp4Parser.audioSampleEntry)
        .box('sinf', Mp4Parser.children)
        .fullBox('schm', (box) => {
          const parsed = Mp4BoxParsers.parseSCHM(box.reader);
          const info = trackInfos.get(currentTrackId);
          if (info) {
            info.encryptionScheme = parsed.encryptionScheme.toLowerCase();
          }
        })
        .box('schi', Mp4Parser.children)
        .fullBox('tenc', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TENC is a full box and should have a valid version.');
          const parsed = Mp4BoxParsers.parseTENC(box.reader, box.version);
          const info = trackInfos.get(currentTrackId);
          if (info) {
            info.defaultKID = parsed.defaultKID;
            info.defaultIVSize = parsed.defaultPerSampleIVSize;
            info.defaultConstantIV = parsed.defaultConstantIV;
            info.defaultCryptByteBlock = parsed.defaultCryptByteBlock;
            info.defaultSkipByteBlock = parsed.defaultSkipByteBlock;
          }
        })
        .parse(initData, /* partialOkay= */ true);

    return trackInfos;
  }

  /**
   * @param {!Uint8Array} segData
   * @param {!Map<number,
   *         !shaka.media.ClearKeyWebCryptoDecryptor.InitInfo>} trackInfos
   * @return {!shaka.media.ClearKeyWebCryptoDecryptor.SegmentParseResult}
   * @private
   */
  parseMediaSegment_(segData, trackInfos) {
    const Mp4Parser = shaka.util.Mp4Parser;
    const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
    const fragments = [];
    let firstFragmentOffset = 0;

    /** @type {?shaka.media.ClearKeyWebCryptoDecryptor.FragmentInfo} */
    let currentFragment = null;

    const markFree = (box) => {
      if (currentFragment) {
        currentFragment.boxesToFree.push({start: box.start, size: box.size});
      }
    };

    new Mp4Parser()
        .box('moof', (box) => {
          if (!fragments.length) {
            firstFragmentOffset = box.start;
          }
          currentFragment = {
            moofStart: box.start,
            moofSize: box.size,
            mdatStart: -1,
            mdatSize: -1,
            sencInfo: null,
            tfhdDefaultSize: 0,
            trackId: 0,
            trunSamples: [],
            boxesToFree: [],
          };
          Mp4Parser.children(box);
        })
        .box('traf', Mp4Parser.children)
        .fullBox('tfhd', (box) => {
          if (!currentFragment) {
            return;
          }
          goog.asserts.assert(
              box.flags != null,
              'TFHD is a full box and should have valid flags.');
          const parsed = Mp4BoxParsers.parseTFHD(box.reader, box.flags);
          currentFragment.trackId = parsed.trackId;
          currentFragment.tfhdDefaultSize = parsed.defaultSampleSize || 0;
        })
        .fullBox('trun', (box) => {
          if (!currentFragment) {
            return;
          }
          goog.asserts.assert(
              box.version != null && box.flags != null,
              'TRUN is a full box and should have a valid version & flags.');
          const parsed = Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);
          for (const sample of parsed.sampleData) {
            currentFragment.trunSamples.push({
              size: sample.sampleSize || currentFragment.tfhdDefaultSize,
            });
          }
        })
        .fullBox('senc', (box) => {
          if (!currentFragment) {
            return;
          }
          goog.asserts.assert(
              box.flags != null,
              'SENC is a full box and should have valid flags.');
          const info = trackInfos.get(currentFragment.trackId);
          if (info) {
            currentFragment.sencInfo = shaka.util.Mp4BoxParsers.parseSENC(
                box.reader, box.flags, info.defaultIVSize,
                info.defaultConstantIV);
          }
          markFree(box);
        })
        .fullBoxes([
          'saiz',
          'saio',
          'sgpd',
          'sbgp',
        ], markFree)
        .box('pssh', markFree)
        .box('mdat', (mdatBox) => {
          if (currentFragment) {
            currentFragment.mdatStart = mdatBox.start;
            currentFragment.mdatSize = mdatBox.size;
            fragments.push(currentFragment);
            currentFragment = null;
          }
        })
        .parse(segData);

    return {fragments, firstFragmentOffset};
  }

  /**
   * @param {!shaka.media.ClearKeyWebCryptoDecryptor.FragmentInfo} fragment
   * @param {!Uint8Array} segData
   * @param {!shaka.media.ClearKeyWebCryptoDecryptor.InitInfo} initInfo
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  async decryptFragment_(fragment, segData, initInfo) {
    const keyId = initInfo.defaultKID;
    const keyEntry = this.keyMap_.get(keyId);

    if (!keyEntry) {
      shaka.log.warning('[ClearKeyDecryptor] No key found for KID:', keyId);
      return segData.slice(
          fragment.moofStart, fragment.mdatStart + fragment.mdatSize);
    }

    const scheme = initInfo.encryptionScheme;
    let sencInfo = fragment.sencInfo;
    if (sencInfo && initInfo.defaultIVSize !== 8) {
      const moofSlice = segData.subarray(
          fragment.moofStart, fragment.moofStart + fragment.moofSize);
      const Mp4Parser = shaka.util.Mp4Parser;
      new Mp4Parser()
          .box('moof', Mp4Parser.children)
          .box('traf', Mp4Parser.children)
          .fullBox('senc', (box) => {
            goog.asserts.assert(
                box.flags != null,
                'SENC is a full box and should have valid flags.');
            sencInfo = shaka.util.Mp4BoxParsers.parseSENC(
                box.reader, box.flags, initInfo.defaultIVSize,
                initInfo.defaultConstantIV);
          })
          .parse(moofSlice, /* partialOkay= */ false);
    }

    const mdatPayloadStart = fragment.mdatStart + 8;
    const mdatPayload = segData.subarray(
        mdatPayloadStart, mdatPayloadStart + fragment.mdatSize - 8);

    const decryptedMdat = await this.decryptMdat_(
        mdatPayload, fragment.trunSamples.map((s) => s.size),
        sencInfo, initInfo, keyEntry, scheme);

    const moof = segData.slice(
        fragment.moofStart, fragment.moofStart + fragment.moofSize);
    const moofView = shaka.util.BufferUtils.toDataView(moof);

    if (fragment.boxesToFree) {
      for (const boxToFree of fragment.boxesToFree) {
        const relStart = boxToFree.start - fragment.moofStart;
        if (relStart >= 0 && (relStart + boxToFree.size) <= moof.byteLength) {
          moofView.setUint32(relStart + 4,
              shaka.media.ClearKeyWebCryptoDecryptor.BOX_TYPE_FREE_,
              /* littleEndian= */ false);
          // Zero payload
          moof.fill(0, relStart + 8, relStart + boxToFree.size);
        }
      }
    }

    const newMdatSize = 8 + decryptedMdat.byteLength;
    const newMdat = new Uint8Array(newMdatSize);
    shaka.util.BufferUtils.toDataView(newMdat).setUint32(
        0, newMdatSize, /* LE= */ false);
    newMdat.set([0x6d, 0x64, 0x61, 0x74], 4); // 'mdat'
    newMdat.set(decryptedMdat, 8);

    return shaka.util.Uint8ArrayUtils.concat(moof, newMdat);
  }

  /**
   * Decrypt the raw mdat payload sample by sample.
   *
   * @param {!Uint8Array} mdatPayload
   * @param {!Array<number>} sampleSizes
   * @param {?shaka.media.ClearKeyWebCryptoDecryptor.SencInfo} senc
   * @param {!shaka.media.ClearKeyWebCryptoDecryptor.InitInfo} initInfo
   * @param {{cbc:!CryptoKey, ctr:!CryptoKey}} keyEntry
   * @param {string} scheme  'cenc' | 'cbcs'
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  async decryptMdat_(
      mdatPayload, sampleSizes, senc, initInfo, keyEntry, scheme) {
    const out = new Uint8Array(mdatPayload.byteLength);

    // Build per-sample decrypt promises; samples are independent of each
    // other so we can run them all in parallel with Promise.all.
    let sampleOffset = 0;
    const samplePromises = sampleSizes.map((sampleSize, i) => {
      const offset = sampleOffset;
      sampleOffset += sampleSize;
      const sampleData = mdatPayload.subarray(offset, offset + sampleSize);

      if (senc && senc.samples[i]) {
        const sencSample = senc.samples[i];

        // Zero-pad 8-byte IVs into the high bytes of a 16-byte block.
        const ivLen = initInfo.defaultIVSize === 16 ? 16 : 8;
        const iv = new Uint8Array(16);
        iv.set(sencSample.iv.slice(0, ivLen), 0);

        if (scheme === 'cenc') {
          return this.decryptSampleCenc_(
              sampleData, iv, sencSample.subsamples, keyEntry)
              .then((dec) => ({offset, dec}));
        }
        // cbcs: use constant IV if signalled in tenc, else per-sample IV.
        const cbcsIV = initInfo.defaultConstantIV || iv;
        return this.decryptSampleCbcs_(
            sampleData, cbcsIV, sencSample.subsamples, initInfo, keyEntry)
            .then((dec) => ({offset, dec}));
      }

      if (scheme === 'cbcs' && initInfo.defaultConstantIV) {
        // No per-sample senc entry — whole sample uses constant IV.
        return this.decryptSampleCbcs_(
            sampleData, initInfo.defaultConstantIV, null, initInfo, keyEntry)
            .then((dec) => ({offset, dec}));
      }

      // Clear sample — pass through unchanged.
      return Promise.resolve({offset, dec: sampleData});
    });

    const results = await Promise.all(samplePromises);
    for (const {offset, dec} of results) {
      out.set(dec, offset);
    }
    return out;
  }

  /**
   * Decrypt one sample under CENC (AES-128-CTR, full or subsample).
   *
   * The IV is the initial 128-bit counter block (big-endian). For
   * subsample encryption the counter is NOT reset between subsample
   * regions — it advances by the number of whole 16-byte blocks
   * consumed in prior regions.
   *
   * @param {!Uint8Array} sampleData
   * @param {!Uint8Array} iv  16 bytes
   * @param {?Array<{clearBytes: number, encryptedBytes: number}>} subsamples
   * @param {{cbc:!CryptoKey, ctr:!CryptoKey}} keyEntry
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  async decryptSampleCenc_(sampleData, iv, subsamples, keyEntry) {
    if (!subsamples || !subsamples.length) {
      return shaka.util.BufferUtils.toUint8(await crypto.subtle.decrypt(
          {name: 'AES-CTR', counter: iv, length: 64},
          keyEntry.ctr, sampleData));
    }

    // Pre-compute per-subsample counters (counter state is cumulative),
    // then decrypt all encrypted ranges in parallel.
    const out = new Uint8Array(sampleData.byteLength);
    let pos = 0;
    let totalEncryptedBlocks = 0;

    const decryptJobs = subsamples.map((sub) => {
      // Copy clear bytes synchronously; record their range.
      const clearStart = pos;
      pos += sub.clearBytes;

      if (sub.encryptedBytes === 0) {
        return Promise.resolve({
          clearStart,
          clearLen: sub.clearBytes,
          encStart: pos,
          encLen: 0,
          decrypted: null,
        });
      }

      // Snapshot counter for this subsample before advancing.
      const counter = iv.slice();
      this.addCounterOffset_(counter, totalEncryptedBlocks);

      const encStart = pos;
      pos += sub.encryptedBytes;
      totalEncryptedBlocks += Math.ceil(sub.encryptedBytes / 16);

      const encData = sampleData.subarray(
          encStart, encStart + sub.encryptedBytes);
      return crypto.subtle.decrypt(
          {name: 'AES-CTR', counter, length: 64},
          keyEntry.ctr, encData)
          .then((buf) => ({
            clearStart,
            clearLen: sub.clearBytes,
            encStart,
            encLen: sub.encryptedBytes,
            decrypted: shaka.util.BufferUtils.toUint8(buf),
          }));
    });

    const results = await Promise.all(decryptJobs);
    for (const r of results) {
      out.set(
          sampleData.subarray(r.clearStart, r.clearStart + r.clearLen),
          r.clearStart);
      if (r.decrypted) {
        out.set(r.decrypted, r.encStart);
      }
    }
    return out;
  }

  /**
   * Decrypt one sample under CBCS (AES-128-CBC pattern encryption).
   *
   * Within each encrypted range, blocks alternate between encrypted
   * (cryptByteBlock x 16 bytes) and clear (skipByteBlock x 16 bytes).
   * Partial trailing blocks are always clear.
   *
   * @param {!Uint8Array} sampleData
   * @param {!Uint8Array} iv  16 bytes
   * @param {?Array<{clearBytes: number, encryptedBytes: number}>} subsamples
   * @param {!shaka.media.ClearKeyWebCryptoDecryptor.InitInfo} initInfo
   * @param {{cbc:!CryptoKey, ctr:!CryptoKey}} keyEntry
   * @return {!Promise<!Uint8Array>}
   * @private
   */
  async decryptSampleCbcs_(
      sampleData, iv, subsamples, initInfo, keyEntry) {
    let cryptBlocks = initInfo.defaultCryptByteBlock;
    let skipBlocks = initInfo.defaultSkipByteBlock;

    // In cbcs, a 0:0 pattern means 100% encrypted, equivalent to 1:0.
    if (cryptBlocks === 0) {
      cryptBlocks = 1;
      skipBlocks = 0;
    }

    const out = new Uint8Array(sampleData.byteLength);
    const jobs = [];

    // State variable to maintain CBC IV chaining across the entire sample.
    let currentIv = iv;

    const processRange = (rangeStart, rangeLen) => {
      let offset = rangeStart;
      const end = rangeStart + rangeLen;

      while (offset < end) {
        const remaining = end - offset;
        const encLen = Math.min(cryptBlocks * 16, remaining);

        if (encLen >= 16) {
          const alignedLen = Math.floor(encLen / 16) * 16;
          const encStart = offset;
          // Partial trailing block of the crypt group is always clear.
          const partialLen = encLen - alignedLen;
          const clearAfterStart = offset + alignedLen;

          // Capture the correct IV for this specific asynchronous block.
          const chunkIv = currentIv;

          jobs.push(this.rawCBCDecrypt_(
              sampleData.subarray(encStart, encStart + alignedLen),
              chunkIv, keyEntry.cbc)
              .then((dec) => {
                out.set(dec, encStart);
                if (partialLen > 0) {
                  out.set(
                      sampleData.subarray(
                          clearAfterStart,
                          clearAfterStart + partialLen),
                      clearAfterStart);
                }
              }),
          );

          // Update the IV for the next block:
          // CBC chaining requires the last 16 bytes of the current ciphertext.
          currentIv = sampleData.slice(
              encStart + alignedLen - 16, encStart + alignedLen);

          offset += alignedLen + partialLen;
        } else {
          // Less than one full block remaining in crypt group — clear.
          out.set(sampleData.subarray(offset, offset + encLen), offset);
          offset += encLen;
        }

        // Skip group — always copied clear.
        const skipLen = Math.min(skipBlocks * 16, end - offset);
        if (skipLen > 0) {
          out.set(sampleData.subarray(offset, offset + skipLen), offset);
          offset += skipLen;
        }
      }
    };

    // Process subsamples synchronously to ensure correct IV chaining order
    // before resolving promises.
    if (!subsamples || !subsamples.length) {
      processRange(0, sampleData.byteLength);
    } else {
      let pos = 0;
      for (const sub of subsamples) {
        const clearStart = pos;
        pos += sub.clearBytes;
        out.set(
            sampleData.subarray(clearStart, clearStart + sub.clearBytes),
            clearStart);

        if (sub.encryptedBytes > 0) {
          const encStart = pos;
          pos += sub.encryptedBytes;
          processRange(encStart, sub.encryptedBytes);
        }
      }
    }

    // Await all decryption jobs concurrently.
    await Promise.all(jobs);
    return out;
  }

  /**
   * AES-128-CBC decryption without PKCS7 unpadding.
   *
   * WebCrypto AES-CBC always applies PKCS7. CBCS stream data is NOT
   * padded — partial final blocks are clear rather than padded. We work
   * around this by appending a synthetic full PKCS7 padding block
   * (16 x 0x10) so WebCrypto's automatic unpadding removes only that
   * dummy block, leaving our real data (always 16-byte aligned here)
   * intact.
   *
   * @param {!Uint8Array} data  Must be 16-byte aligned
   * @param {!Uint8Array} iv    16 bytes
   * @param {!CryptoKey} cbcKey AES-CBC key
   * @return {!Promise<!Uint8Array>}  Exactly data.byteLength bytes
   * @private
   */
  async rawCBCDecrypt_(data, iv, cbcKey) {
    if (!data || !data.byteLength || data.byteLength % 16 !== 0) {
      return new Uint8Array(0);
    }

    const numBlocks = data.byteLength / 16;
    const lastCiphertextBlock =
        data.subarray((numBlocks - 1) * 16, numBlocks * 16);

    // Mathematical requirement to force a PKCS#7 padding block
    const paddingBlock = lastCiphertextBlock.map((b) => 0x10 ^ b);

    // Artificial padding encryption using zero IV (AES-ECB simulation)
    const zeroIv = new Uint8Array(16);
    const encryptedPadding = await crypto.subtle.encrypt(
        {name: 'AES-CBC', iv: zeroIv},
        cbcKey,
        paddingBlock,
    );

    // Take only the first 16 bytes
    const extraCiphertextBlock = new Uint8Array(encryptedPadding, 0, 16);

    // Concatenate synthetic block at the end
    const extendedCiphertext = new Uint8Array(data.byteLength + 16);
    extendedCiphertext.set(data, 0);
    extendedCiphertext.set(extraCiphertextBlock, data.byteLength);

    // WebCrypto will strip the extra block cleanly
    const decrypted = await crypto.subtle.decrypt(
        {name: 'AES-CBC', iv: iv},
        cbcKey,
        extendedCiphertext,
    );

    return shaka.util.BufferUtils.toUint8(decrypted);
  }

  /**
   * Add a block-count offset to a 16-byte big-endian AES-CTR counter.
   * Only the lower 8 bytes (bytes 8-15) act as the incrementing counter
   * per the CENC spec (section 9.1); the upper 8 bytes are the IV nonce.
   *
   * @param {!Uint8Array} counter  modified in place, 16 bytes
   * @param {number} offset        number of 16-byte blocks to add
   * @private
   */
  addCounterOffset_(counter, offset) {
    let carry = offset;
    for (let i = 15; i >= 8 && carry > 0; i--) {
      carry += counter[i];
      counter[i] = carry & 0xff;
      carry >>>= 8;
    }
  }

  /**
   * Returns true if the ClearKey WebCrypto path should be used.
   *
   * @param {?shaka.extern.DrmInfo} drmInfo
   * @return {boolean}
   */
  static shouldUse(drmInfo) {
    if (!drmInfo) {
      return false;
    }
    if (!window.crypto?.subtle) {
      return false;
    }
    if (!shaka.drm.DrmUtils.isClearKeySystem(drmInfo.keySystem)) {
      return false;
    }
    return !shaka.device.DeviceFactory.getDevice().hasWorkingClearKeySupport();
  }
};

/**
 * Box type for "free".
 *
 * @const {number}
 * @private
 */
shaka.media.ClearKeyWebCryptoDecryptor.BOX_TYPE_FREE_ = 0x66726565;


/**
 * @typedef {{
 *   defaultKID: string,
 *   encryptionScheme: string,
 *   defaultIVSize: number,
 *   defaultConstantIV: ?Uint8Array,
 *   defaultCryptByteBlock: number,
 *   defaultSkipByteBlock: number,
 * }}
 */
shaka.media.ClearKeyWebCryptoDecryptor.InitInfo;


/**
 * @typedef {{
 *   moofStart: number,
 *   moofSize: number,
 *   mdatStart: number,
 *   mdatSize: number,
 *   sencInfo: ?shaka.media.ClearKeyWebCryptoDecryptor.SencInfo,
 *   tfhdDefaultSize: number,
 *   trackId: number,
 *   trunSamples: !Array<{size: number}>,
 *   boxesToFree: !Array<{start: number, size: number}>,
 * }}
 */
shaka.media.ClearKeyWebCryptoDecryptor.FragmentInfo;


/**
 * @typedef {{
 *   samples: !Array<{
 *     iv: !Uint8Array,
 *     subsamples:
 *         ?Array<{clearBytes: number, encryptedBytes: number}>
 *   }>
 * }}
 */
shaka.media.ClearKeyWebCryptoDecryptor.SencInfo;


/**
 * @typedef {{
 *   fragments:
 *       !Array<!shaka.media.ClearKeyWebCryptoDecryptor.FragmentInfo>,
 *   firstFragmentOffset: number,
 * }}
 */
shaka.media.ClearKeyWebCryptoDecryptor.SegmentParseResult;
