/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Scte35');
goog.provide('shaka.util.Scte35.Reader');

goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');

/** Transport-independent SCTE-35 extraction and normalization. */
shaka.util.Scte35 = class {
  /**
   * @param {string} scheme
   * @return {boolean}
   */
  static isScheme(scheme) {
    return shaka.util.Scte35.SCHEMES_.includes(scheme.trim());
  }

  /**
   * @param {string} source
   * @param {string} id
   * @param {string} scheme
   * @param {number} startTime
   * @param {?number} duration
   * @return {shaka.extern.Scte35Event}
   */
  static create(source, id, scheme, startTime, duration) {
    return {
      startTime, duration, plannedDuration: null, kind: 'message',
      origins: [{source, id, scope: '', schemeIdUri: scheme}],
      data: null, rawData: null, xml: null, status: 'invalid',
      ptsAdjustment: null,
      command: null, segmentationDescriptors: [],
    };
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @param {string=} scope Identifies the DASH Period.
   * @return {?shaka.extern.Scte35Event}
   */
  static fromRegion(region, scope = '') {
    if (!shaka.util.Scte35.isScheme(region.schemeIdUri)) {
      return null;
    }
    const event = shaka.util.Scte35.create('dash', region.id,
        region.schemeIdUri, region.startTime,
        region.endTime - region.startTime);
    event.origins[0].scope = JSON.stringify([scope, region.value]);
    if (region.eventNode) {
      shaka.util.Scte35.parseXml_(event, region.eventNode);
    }
    return event;
  }

  /**
   * @param {shaka.extern.EmsgInfo} emsg
   * @return {?shaka.extern.Scte35Event}
   */
  static fromEmsg(emsg) {
    if (!shaka.util.Scte35.isScheme(emsg.schemeIdUri)) {
      return null;
    }
    const event = shaka.util.Scte35.create('emsg', String(emsg.id),
        emsg.schemeIdUri, emsg.startTime,
        emsg.eventDuration == 0xffffffff ? null :
        emsg.endTime - emsg.startTime);
    if (!emsg.messageData) {
      return event;
    }
    if (emsg.schemeIdUri.trim().endsWith(':bin')) {
      shaka.util.Scte35.parseBinary(event, emsg.messageData);
    } else {
      try {
        event.rawData = shaka.util.StringUtils.fromUTF8(emsg.messageData);
        const xml = shaka.util.TXml.parseXmlString(event.rawData);
        if (xml) {
          shaka.util.Scte35.parseXml_(event, xml);
        }
      } catch (e) {
        // Keep malformed messages observable without failing playback.
      }
    }
    return event;
  }

  /**
   * Parse a complete splice_info_section.  Failures never escape into playback.
   * @param {shaka.extern.Scte35Event} event
   * @param {!Uint8Array} data
   */
  static parseBinary(event, data) {
    event.data = data.slice();
    event.status = 'invalid';
    const Reader = shaka.util.Scte35.Reader;
    try {
      const r = new Reader(data);
      if (r.read(8) != 0xfc) {
        return;
      }
      r.read(4);
      const sectionLength = r.read(12);
      if (sectionLength + 3 != data.length || data.length < 20 ||
          shaka.util.Scte35.crc_(data) != 0) {
        return;
      }
      const protocolVersion = r.read(8);
      const encrypted = r.read(1);
      r.read(6);
      event.ptsAdjustment = r.read(33);
      r.read(8); // cw_index
      r.read(12); // tier
      const commandLength = r.read(12);
      const type = r.read(8);
      if (encrypted || protocolVersion != 0) {
        event.status = 'unsupported';
        return;
      }
      const commandStart = r.position;
      const command = shaka.util.Scte35.command_(type);
      let supported = true;
      if (type == 5) {
        command.spliceEventId = r.read(32);
        command.cancel = !!r.read(1);
        r.read(7);
        if (!command.cancel) {
          command.outOfNetwork = !!r.read(1);
          const program = r.read(1);
          const duration = r.read(1);
          command.immediate = !!r.read(1);
          r.read(4);
          if (program && !command.immediate) {
            command.ptsTime = shaka.util.Scte35.spliceTime_(r);
          } else if (!program) {
            const count = r.read(8);
            for (let i = 0; i < count; i++) {
              const tag = r.read(8);
              const ptsTime = command.immediate ? null :
                  shaka.util.Scte35.spliceTime_(r);
              command.components.push({tag, ptsTime, ptsOffset: null});
            }
          }
          if (duration) {
            command.autoReturn = !!r.read(1);
            r.read(6);
            command.breakDuration = r.read(33);
          }
          command.uniqueProgramId = r.read(16);
          command.availNum = r.read(8);
          command.availsExpected = r.read(8);
        }
      } else if (type == 6) {
        command.ptsTime = shaka.util.Scte35.spliceTime_(r);
      } else if (type != 0 && type != 7) {
        supported = false;
      }
      if (commandLength != 0xfff) {
        const commandEnd = commandStart + commandLength * 8;
        if (r.position > commandEnd ||
            (supported && r.position != commandEnd)) {
          return;
        }
        r.skipTo(commandEnd);
      } else if (!supported) {
        event.status = 'unsupported';
        return;
      }
      const descriptorLength = r.read(16);
      const descriptorEnd = r.position + descriptorLength * 8;
      if (descriptorEnd > (data.length - 4) * 8) {
        return;
      }
      const descriptors = [];
      while (r.position < descriptorEnd) {
        const tag = r.read(8);
        const length = r.read(8);
        const bytes = r.bytes(length);
        if (r.position > descriptorEnd) {
          return;
        }
        if (tag != 2) {
          supported = false;
        }
        if (tag == 2) {
          const descriptor = shaka.util.Scte35.segmentation_(new Reader(bytes));
          if (descriptor) {
            descriptors.push(descriptor);
          } else {
            supported = false;
          }
        }
      }
      event.command = command;
      event.segmentationDescriptors = descriptors;
      event.status = supported ? 'parsed' : 'unsupported';
    } catch (e) {
      // A truncated section or descriptor is invalid, not a playback error.
    }
  }

  /**
   * @param {number} type
   * @return {shaka.extern.Scte35Command} @private
   */
  static command_(type) {
    return {
      type, spliceEventId: null, cancel: false, outOfNetwork: null,
      immediate: false, ptsTime: null, breakDuration: null, autoReturn: null,
      uniqueProgramId: null, availNum: null, availsExpected: null,
      components: [],
    };
  }

  /**
   * @param {!shaka.util.Scte35.Reader} r
   * @return {?number}
   * @private
   */
  static spliceTime_(r) {
    const specified = r.read(1);
    r.read(specified ? 6 : 7);
    return specified ? r.read(33) : null;
  }

  /**
   * @param {number} id
   * @return {shaka.extern.Scte35SegmentationDescriptor}
   * @private
   */
  static descriptor_(id) {
    return {
      segmentationEventId: id, cancel: false, duration: null, typeId: null,
      upidType: null, upid: null, segmentNum: null, segmentsExpected: null,
      subSegmentNum: null, subSegmentsExpected: null,
      deliveryNotRestricted: true, webDeliveryAllowed: null,
      noRegionalBlackout: null, archiveAllowed: null, deviceRestrictions: null,
      components: [],
    };
  }

  /**
   * @param {!shaka.util.Scte35.Reader} r
   * @return {?shaka.extern.Scte35SegmentationDescriptor}
   * @private
   */
  static segmentation_(r) {
    if (r.read(32) != 0x43554549) { // CUEI
      return null;
    }
    const d = shaka.util.Scte35.descriptor_(r.read(32));
    d.cancel = !!r.read(1);
    r.read(7);
    if (d.cancel) {
      return d;
    }
    const program = r.read(1);
    const duration = r.read(1);
    d.deliveryNotRestricted = !!r.read(1);
    if (d.deliveryNotRestricted) {
      r.read(5);
    } else {
      d.webDeliveryAllowed = !!r.read(1);
      d.noRegionalBlackout = !!r.read(1);
      d.archiveAllowed = !!r.read(1);
      d.deviceRestrictions = r.read(2);
    }
    if (!program) {
      const count = r.read(8);
      for (let i = 0; i < count; i++) {
        const tag = r.read(8);
        r.read(7);
        d.components.push({tag, ptsTime: null, ptsOffset: r.read(33)});
      }
    }
    d.duration = duration ? r.read(40) : null;
    d.upidType = r.read(8);
    d.upid = shaka.util.Uint8ArrayUtils.toHex(r.bytes(r.read(8)));
    d.typeId = r.read(8);
    d.segmentNum = r.read(8);
    d.segmentsExpected = r.read(8);
    // The optional appendix is signaled by descriptor_length, including for
    // older senders which omit it on placement opportunity start messages.
    if ([0x30, 0x32, 0x34, 0x36, 0x38, 0x3a, 0x44, 0x46].includes(d.typeId) &&
        r.remaining() > 0) {
      d.subSegmentNum = r.read(8);
      d.subSegmentsExpected = r.read(8);
    }
    return d;
  }

  /**
   * @param {shaka.extern.Scte35Event} event
   * @param {!shaka.extern.xml.Node} xml
   * @private
   */
  static parseXml_(event, xml) {
    const Scte35 = shaka.util.Scte35;
    event.xml = shaka.util.TXml.cloneNode(xml);
    try {
      const binary = Scte35.find_(xml, 'Binary');
      if (binary) {
        const text = (shaka.util.TXml.getContents(binary) || '')
            .replace(/\s/g, '');
        event.rawData = text;
        if (!text || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4) {
          return;
        }
        Scte35.parseBinary(event, shaka.util.Uint8ArrayUtils.fromBase64(text));
        return;
      }
      const section = Scte35.find_(xml, 'SpliceInfoSection');
      if (!section) {
        return;
      }
      event.ptsAdjustment = Scte35.number_(section, 'ptsAdjustment') || 0;
      if (Scte35.boolean_(section, 'encryptedPacket') ||
          (Scte35.number_(section, 'protocolVersion') || 0) != 0) {
        event.status = 'unsupported';
        return;
      }
      const insert = Scte35.find_(section, 'SpliceInsert');
      const signal = Scte35.find_(section, 'TimeSignal');
      const command = Scte35.command_(insert ? 5 : signal ? 6 : 0);
      const node = insert || signal;
      if (node) {
        const time = Scte35.find_(node, 'SpliceTime');
        command.ptsTime = time ? Scte35.number_(time, 'ptsTime') : null;
      }
      if (insert) {
        command.spliceEventId = Scte35.number_(insert, 'spliceEventId');
        command.cancel = Scte35.boolean_(insert, 'spliceEventCancelIndicator');
        if (!command.cancel) {
          command.outOfNetwork = Scte35.boolean_(insert,
              'outOfNetworkIndicator');
          command.immediate = Scte35.boolean_(insert, 'spliceImmediateFlag');
          command.uniqueProgramId = Scte35.number_(insert, 'uniqueProgramId');
          command.availNum = Scte35.number_(insert, 'availNum');
          command.availsExpected = Scte35.number_(insert, 'availsExpected');
          const duration = Scte35.find_(insert, 'BreakDuration');
          if (duration) {
            command.breakDuration = Scte35.number_(duration, 'duration');
            command.autoReturn = Scte35.boolean_(duration, 'autoReturn');
          }
          for (const component of Scte35.children_(insert, 'Component')) {
            const time = Scte35.find_(component, 'SpliceTime');
            command.components.push({
              tag: Scte35.number_(component, 'componentTag') || 0,
              ptsTime: time ? Scte35.number_(time, 'ptsTime') : null,
              ptsOffset: null,
            });
          }
          if (command.components.length) {
            command.ptsTime = null;
          }
        }
      }
      const descriptors = [];
      for (const node of Scte35.children_(section, 'SegmentationDescriptor')) {
        const id = Scte35.number_(node, 'segmentationEventId') ??
            Scte35.number_(node, 'spliceEventId');
        if (id == null) {
          throw new Error('Missing segmentation event ID');
        }
        const d = Scte35.descriptor_(id);
        d.cancel = Scte35.boolean_(node, 'segmentationEventCancelIndicator');
        if (!d.cancel) {
          d.duration = Scte35.number_(node, 'segmentationDuration');
          d.typeId = Scte35.number_(node, 'segmentationTypeId');
          d.segmentNum = Scte35.number_(node, 'segmentNum');
          d.segmentsExpected = Scte35.number_(node, 'segmentsExpected');
          d.subSegmentNum = Scte35.number_(node, 'subSegmentNum');
          d.subSegmentsExpected = Scte35.number_(node, 'subSegmentsExpected');
          const upids = Scte35.children_(node, 'SegmentationUpid');
          if (upids.length) {
            const values = upids.map((upid) => Scte35.upid_(upid));
            if (values.length == 1) {
              d.upidType = values[0].type;
              d.upid = shaka.util.Uint8ArrayUtils.toHex(values[0].data);
            } else {
              d.upidType = 0x0d; // MID: multiple UPIDs.
              let bytes = new Uint8Array(0);
              for (const value of values) {
                bytes = shaka.util.Uint8ArrayUtils.concat(bytes,
                    new Uint8Array([value.type, value.data.length]),
                    value.data);
              }
              d.upid = shaka.util.Uint8ArrayUtils.toHex(bytes);
            }
          } else {
            d.upidType = Scte35.number_(node, 'segmentationUpidType');
            const value = node.attributes['segmentationUpid'];
            d.upid = value == null ? null : value.toLowerCase();
          }
          const restrictions = Scte35.find_(node, 'DeliveryRestrictions');
          if (restrictions) {
            d.deliveryNotRestricted = false;
            d.webDeliveryAllowed = Scte35.boolean_(restrictions,
                'webDeliveryAllowedFlag');
            d.noRegionalBlackout = Scte35.boolean_(restrictions,
                'noRegionalBlackoutFlag');
            d.archiveAllowed = Scte35.boolean_(restrictions,
                'archiveAllowedFlag');
            d.deviceRestrictions = Scte35.number_(restrictions,
                'deviceRestrictions');
          }
          for (const component of Scte35.children_(node, 'Component')) {
            d.components.push({
              tag: Scte35.number_(component, 'componentTag') || 0,
              ptsTime: null, ptsOffset: Scte35.number_(component, 'ptsOffset'),
            });
          }
        }
        descriptors.push(d);
      }
      event.command = command;
      event.segmentationDescriptors = descriptors;
      const knownElements = ['SpliceInsert', 'TimeSignal', 'SpliceNull',
        'SegmentationDescriptor'];
      const unknown = section.children.some((child) =>
        typeof child != 'string' &&
        !knownElements.includes(child.tagName.split(':').pop()));
      event.status = !unknown &&
          (insert || signal || Scte35.find_(section, 'SpliceNull')) ?
          'parsed' : 'unsupported';
    } catch (e) {
      event.status = 'invalid';
    }
  }

  /**
   * Normalize an XML UPID to the same bytes used by binary segmentation data.
   * @param {!shaka.extern.xml.Node} node
   * @return {{type: number, data: !Uint8Array}}
   * @private
   */
  static upid_(node) {
    const Scte35 = shaka.util.Scte35;
    const type = Scte35.number_(node, 'segmentationUpidType') ??
        Scte35.number_(node, 'type') ?? 0;
    const format = node.attributes['segmentationUpidFormat'] ||
        node.attributes['format'] || 'hexBinary';
    const text = shaka.util.TXml.getContents(node) || '';
    let data;
    if (format == 'hexBinary') {
      const hex = text.replace(/\s/g, '');
      if (!/^(?:[a-fA-F0-9]{2})*$/.test(hex)) {
        throw new Error('Invalid SCTE-35 UPID');
      }
      data = shaka.util.Uint8ArrayUtils.fromHex(hex);
    } else if (format == 'base-64') {
      data = shaka.util.Uint8ArrayUtils.fromBase64(text.replace(/\s/g, ''));
    } else if (format == 'text') {
      data = shaka.util.BufferUtils.toUint8(
          shaka.util.StringUtils.toUTF8(text));
    } else {
      throw new Error('Unsupported SCTE-35 UPID format');
    }
    const identifier = Scte35.number_(node, 'formatIdentifier');
    if (type == 0x0c && identifier != null) {
      const prefix = new Uint8Array(4);
      for (let i = 0; i < 4; i++) {
        prefix[i] = (identifier >>> (24 - i * 8)) & 0xff;
      }
      data = shaka.util.Uint8ArrayUtils.concat(prefix, data);
    }
    if (type > 255 || data.length > 255) {
      throw new Error('Invalid SCTE-35 UPID length');
    }
    return {type, data};
  }

  /**
   * Match local names regardless of the producer's XML namespace prefix.
   * @param {!shaka.extern.xml.Node} node
   * @param {string} name
   * @return {?shaka.extern.xml.Node}
   * @private
   */
  static find_(node, name) {
    if (node.tagName.split(':').pop() == name) {
      return node;
    }
    for (const child of node.children) {
      if (typeof child != 'string') {
        const found = shaka.util.Scte35.find_(child, name);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * @param {!shaka.extern.xml.Node} node
   * @param {string} name
   * @return {!Array<!shaka.extern.xml.Node>}
   * @private
   */
  static children_(node, name) {
    return node.children.filter((child) => typeof child != 'string' &&
        child.tagName.split(':').pop() == name);
  }

  /**
   * @param {!shaka.extern.xml.Node} node
   * @param {string} name
   * @return {?number}
   * @private
   */
  static number_(node, name) {
    const text = node.attributes[name];
    if (text == null) {
      return null;
    }
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
      throw new Error('Invalid SCTE-35 number');
    }
    return Number(text);
  }

  /**
   * @param {!shaka.extern.xml.Node} node
   * @param {string} name
   * @return {boolean}
   * @private
   */
  static boolean_(node, name) {
    const text = node.attributes[name];
    if (text != null && !['true', 'false', '0', '1'].includes(text)) {
      throw new Error('Invalid SCTE-35 boolean');
    }
    return text == 'true' || text == '1';
  }

  /**
   * @param {!Uint8Array} data
   * @return {number} @private
   */
  static crc_(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte << 24;
      for (let i = 0; i < 8; i++) {
        crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
      }
    }
    return crc >>> 0;
  }
};

/** @private @const {!Array<string>} */
shaka.util.Scte35.SCHEMES_ = [
  'urn:scte:scte35:2013:xml',
  'urn:scte:scte35:2014:xml+bin',
  // Compatibility alias used by some producers.
  'urn:scte:scte35:2013:xml+bin',
  'urn:scte:scte35:2013:bin',
];

/** A bounded bit reader which preserves 33- and 40-bit unsigned values. */
shaka.util.Scte35.Reader = class {
  /** @param {!Uint8Array} data */
  constructor(data) {
    /** @private @const {!Uint8Array} */
    this.data_ = data;
    /** @type {number} */
    this.position = 0;
  }

  /** @return {number} */
  remaining() {
    return this.data_.length * 8 - this.position;
  }

  /**
   * @param {number} count
   * @return {number}
   */
  read(count) {
    if (this.position + count > this.data_.length * 8) {
      throw new Error('Truncated SCTE-35 section');
    }
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = value * 2 +
          ((this.data_[this.position >> 3] >> (7 - this.position % 8)) & 1);
      this.position++;
    }
    return value;
  }

  /** @param {number} position */
  skipTo(position) {
    if (position < this.position || position > this.data_.length * 8) {
      throw new Error('Invalid SCTE-35 length');
    }
    this.position = position;
  }

  /**
   * @param {number} count
   * @return {!Uint8Array}
   */
  bytes(count) {
    const start = this.position / 8;
    this.skipTo(this.position + count * 8);
    return this.data_.slice(start, start + count);
  }
};
