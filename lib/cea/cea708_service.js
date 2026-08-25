/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Service');

goog.require('shaka.cea.Cea708Window');
goog.require('shaka.cea.DtvccPacket');


/**
 * CEA-708 closed captions service as defined by CEA-708-E. A decoder can own up
 * to 63 services. Each service owns eight windows.
 */
shaka.cea.Cea708Service = class {
  /**
   * @param {number} serviceNumber
   */
  constructor(serviceNumber) {
    /**
     * Number for this specific service (1 - 63).
     * @private {number}
     */
    this.serviceNumber_ = serviceNumber;

    /**
     * Eight Cea708 Windows, as defined by the spec.
     * @private {!Array<?shaka.cea.Cea708Window>}
     */
    this.windows_ = [
      null, null, null, null, null, null, null, null,
    ];

    /**
     * The current window for which window command operate on.
     * @private {?shaka.cea.Cea708Window}
     */
    this.currentWindow_ = null;
  }

  /**
   * Processes a CEA-708 control code.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @throws {!shaka.util.Error}
   */
  handleCea708ControlCode(dtvccPacket) {
    const blockData = dtvccPacket.readByte();
    let controlCode = blockData.value;
    const pts = blockData.pts;

    // Read extended control code if needed.
    if (controlCode === shaka.cea.Cea708Service.EXT_CEA708_CTRL_CODE_BYTE1) {
      const extendedControlCodeBlock = dtvccPacket.readByte();
      controlCode = (controlCode << 16) | extendedControlCodeBlock.value;
    }

    // Control codes are in 1 of 4 logical groups:
    // CL (C0, C2), CR (C1, C3), GL (G0, G2), GR (G1, G3).
    if (controlCode >= 0x00 && controlCode <= 0x1f) {
      return this.handleC0_(dtvccPacket, controlCode, pts);
    } else if (controlCode >= 0x80 && controlCode <= 0x9f) {
      return this.handleC1_(dtvccPacket, controlCode, pts);
    } else if (controlCode >= 0x1000 && controlCode <= 0x101f) {
      this.handleC2_(dtvccPacket, controlCode & 0xff);
    } else if (controlCode >= 0x1080 && controlCode <= 0x109f) {
      this.handleC3_(dtvccPacket, controlCode & 0xff);
    } else if (controlCode >= 0x20 && controlCode <= 0x7f) {
      this.handleG0_(controlCode);
    } else if (controlCode >= 0xa0 && controlCode <= 0xff) {
      this.handleG1_(controlCode);
    } else if (controlCode >= 0x1020 && controlCode <= 0x107f) {
      this.handleG2_(controlCode & 0xff);
    } else if (controlCode >= 0x10a0 && controlCode <= 0x10ff) {
      this.handleG3_(controlCode & 0xff);
    }

    return [];
  }

  /**
   * Handles G0 group data.
   * @param {number} controlCode
   * @private
   */
  handleG0_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    // G0 contains ASCII from 0x20 to 0x7f, with the exception that 0x7f
    // is replaced by a musical note.
    if (controlCode === 0x7f) {
      this.currentWindow_.setCharacter('♪');
      return;
    }
    this.currentWindow_.setCharacter(String.fromCharCode(controlCode));
  }

  /**
   * Handles G1 group data.
   * @param {number} controlCode
   * @private
   */
  handleG1_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    // G1 is the Latin-1 Character Set from 0xa0 to 0xff.
    this.currentWindow_.setCharacter(String.fromCharCode(controlCode));
  }

  /**
   * Handles G2 group data.
   * @param {number} controlCode
   * @private
   */
  handleG2_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    if (!shaka.cea.Cea708Service.G2Charset.has(controlCode)) {
      // If the character is unsupported, the spec says to put an underline.
      this.currentWindow_.setCharacter('_');
      return;
    }

    const char = shaka.cea.Cea708Service.G2Charset.get(controlCode);
    this.currentWindow_.setCharacter(char);
  }

  /**
   * Handles G3 group data.
   * @param {number} controlCode
   * @private
   */
  handleG3_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }

    // As of CEA-708-E, the G3 group only contains 1 character. It's a
    // [CC] character which has no unicode value on 0xa0.
    if (controlCode != 0xa0) {
      // Similar to G2, the spec decrees an underline if char is unsupported.
      this.currentWindow_.setCharacter('_');
      return;
    }

    this.currentWindow_.setCharacter('[CC]');
  }

  /**
   * Handles C0 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {number} controlCode
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  handleC0_(dtvccPacket, controlCode, pts) {
    if (controlCode == 0x18) {
      // P16 character. This always carries 2 data bytes, so they must be read
      // even if there is no current window to draw into; otherwise the packet
      // read position goes out of sync and the rest of the block is
      // misinterpreted.
      const firstByte = dtvccPacket.readByte().value;
      const secondByte = dtvccPacket.readByte().value;

      if (!this.currentWindow_) {
        return [];
      }

      // The two bytes form a single 16-bit character code.
      const char = String.fromCharCode((firstByte << 8) | secondByte);
      this.currentWindow_.setCharacter(char);
      return [];
    }

    // All the remaining commands pertain to the current window, so ensure it
    // exists.
    if (!this.currentWindow_) {
      return [];
    }

    const window = this.currentWindow_;
    let parsedClosedCaption = null;

    // Note: This decoder ignores the "ETX" (end of text) control code. Since
    // this is JavaScript, a '\0' is not needed to terminate a string.
    switch (controlCode) {
      case shaka.cea.Cea708Service.ASCII_BACKSPACE:
        window.backspace();
        break;
      case shaka.cea.Cea708Service.ASCII_CARRIAGE_RETURN:
        // Force out the buffer, since the top row could be lost.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.carriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_HOR_CARRIAGE_RETURN:
        // Force out the buffer, a row will be erased.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.horizontalCarriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_FORM_FEED:
        // Clear window and move pen to (0,0).
        // Force emit if the window is visible.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.resetMemory();
        window.setPenLocation(0, 0);
        break;
    }
    return parsedClosedCaption ? [parsedClosedCaption] : [];
  }

  /**
   * Processes C1 group data.
   * These are caption commands.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {number} captionCommand
   * @param {number} pts in seconds
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @throws {!shaka.util.Error} a possible out-of-range buffer read.
   * @private
   */
  handleC1_(dtvccPacket, captionCommand, pts) {
    // Delay/DelayCancel do not affect timing here, but Delay's operand byte
    // must still be consumed for block alignment.

    if (captionCommand >= 0x80 && captionCommand <= 0x87) {
      const windowNum = captionCommand & 0x07;
      this.setCurrentWindow_(windowNum);
    } else if (captionCommand === 0x88) {
      const bitmap = dtvccPacket.readByte().value;
      return this.clearWindows_(bitmap, pts);
    } else if (captionCommand === 0x89) {
      const bitmap = dtvccPacket.readByte().value;
      this.displayWindows_(bitmap, pts);
    } else if (captionCommand === 0x8a) {
      const bitmap = dtvccPacket.readByte().value;
      return this.hideWindows_(bitmap, pts);
    } else if (captionCommand === 0x8b) {
      const bitmap = dtvccPacket.readByte().value;
      return this.toggleWindows_(bitmap, pts);
    } else if (captionCommand === 0x8c) {
      const bitmap = dtvccPacket.readByte().value;
      return this.deleteWindows_(bitmap, pts);
    } else if (captionCommand === 0x8d) {
      // DLY (Delay): consume exactly one operand byte to keep block alignment.
      this.delay_(dtvccPacket);
    } else if (captionCommand === 0x8e) {
      // DLC (DelayCancel): no operand byte.
      this.delayCancel_();
    } else if (captionCommand === 0x8f) {
      return this.reset_(pts);
    } else if (captionCommand === 0x90) {
      this.setPenAttributes_(dtvccPacket);
    } else if (captionCommand === 0x91) {
      this.setPenColor_(dtvccPacket);
    } else if (captionCommand === 0x92) {
      this.setPenLocation_(dtvccPacket);
    } else if (captionCommand === 0x97) {
      this.setWindowAttributes_(dtvccPacket);
    } else if (captionCommand >= 0x98 && captionCommand <= 0x9f) {
      const windowNum = (captionCommand & 0x0f) - 8;
      this.defineWindow_(dtvccPacket, windowNum, pts);
    }
    return [];
  }

  /**
   * Handles Delay (DLY, 0x8d). Consumes the operand byte for block alignment;
   * this decoder applies no delay.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  delay_(dtvccPacket) {
    dtvccPacket.readByte();
  }

  /**
   * Handles DelayCancel (DLC, 0x8e). No-op; this decoder applies no delays.
   * @private
   */
  delayCancel_() {
  }

  /**
   * Handles C2 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {number} controlCode
   * @private
   */
  handleC2_(dtvccPacket, controlCode) {
    // As of the CEA-708-E spec there are no commands on the C2 table, but if
    // seen, then the appropriate number of bytes must be skipped as per spec.
    if (controlCode >= 0x08 && controlCode <= 0x0f) {
      dtvccPacket.skip(1);
    } else if (controlCode >= 0x10 && controlCode <= 0x17) {
      dtvccPacket.skip(2);
    } else if (controlCode >= 0x18 && controlCode <= 0x1f) {
      dtvccPacket.skip(3);
    }
  }

  /**
   * Handles C3 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {number} controlCode
   * @private
   */
  handleC3_(dtvccPacket, controlCode) {
    // As of the CEA-708-E spec there are no commands on the C3 table, but if
    // seen, then the appropriate number of bytes must be skipped as per spec.
    if (controlCode >= 0x80 && controlCode <= 0x87) {
      dtvccPacket.skip(4);
    } else if (controlCode >= 0x88 && controlCode <= 0x8f) {
      dtvccPacket.skip(5);
    }
  }

  /**
   * @param {number} windowNum
   * @private
   */
  setCurrentWindow_(windowNum) {
    // If the window isn't created, ignore the command.
    if (!this.windows_[windowNum]) {
      return;
    }
    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Returns the ids of each non-null window specified in the 8-bit bitmap.
   * @param {number} bitmap 8 bits corresponding to each of the 8 windows.
   * @return {!Array<number>}
   * @private
   */
  getSpecifiedWindowIds_(bitmap) {
    const ids = [];
    for (let i = 0; i < 8; i++) {
      const windowSpecified = (bitmap & 0x01) === 0x01;
      if (windowSpecified && this.windows_[i]) {
        ids.push(i);
      }
      bitmap >>= 1;
    }
    return ids;
  }

  /**
   * @param {number} windowsBitmap
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  clearWindows_(windowsBitmap, pts) {
    const parsedClosedCaptions = [];

    // Clears windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      // If window visible and being cleared, emit buffer and reset start time!
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        const newParsedClosedCaption =
            window.forceEmit(pts, this.serviceNumber_);
        if (newParsedClosedCaption) {
          parsedClosedCaptions.push(newParsedClosedCaption);
        }
      }
      window.resetMemory();
    }
    return parsedClosedCaptions;
  }

  /**
   * @param {number} windowsBitmap
   * @param {number} pts
   * @private
   */
  displayWindows_(windowsBitmap, pts) {
    // Displays windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (!window.isVisible()) {
        // We are turning on the visibility, set the start time.
        window.setStartTime(pts);
      }
      window.display();
    }
  }

  /**
   * @param {number} windowsBitmap
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  hideWindows_(windowsBitmap, pts) {
    const parsedClosedCaptions = [];

    // Hides windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        const newParsedClosedCaption =
            window.forceEmit(pts, this.serviceNumber_);
        if (newParsedClosedCaption) {
          parsedClosedCaptions.push(newParsedClosedCaption);
        }
      }
      window.hide();
    }
    return parsedClosedCaptions;
  }

  /**
   * @param {number} windowsBitmap
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  toggleWindows_(windowsBitmap, pts) {
    const parsedClosedCaptions = [];

    // Toggles windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        const newParsedClosedCaption =
            window.forceEmit(pts, this.serviceNumber_);
        if (newParsedClosedCaption) {
          parsedClosedCaptions.push(newParsedClosedCaption);
        }
      } else {
        // We are turning on visibility, set the start time.
        window.setStartTime(pts);
      }

      window.toggle();
    }
    return parsedClosedCaptions;
  }

  /**
   * @param {number} windowsBitmap
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  deleteWindows_(windowsBitmap, pts) {
    const parsedClosedCaptions = [];
    // Deletes windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        const newParsedClosedCaption =
            window.forceEmit(pts, this.serviceNumber_);
        if (newParsedClosedCaption) {
          parsedClosedCaptions.push(newParsedClosedCaption);
        }
      }
      // Delete the window from the list of windows
      this.windows_[windowId] = null;
    }
    return parsedClosedCaptions;
  }

  /**
   * Emits anything currently present in any of the windows, and then
   * deletes all windows, cancels all delays, reinitializes the service.
   * @param {number} pts
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  reset_(pts) {
    const allWindowsBitmap = 0xff; // All windows should be deleted.
    const captions = this.deleteWindows_(allWindowsBitmap, pts);
    this.clear();
    return captions;
  }

  /**
   * Clears the state of the service completely.
   */
  clear() {
    this.currentWindow_ = null;
    this.windows_ = [null, null, null, null, null, null, null, null];
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenAttributes_(dtvccPacket) {
    // Two bytes follow.
    // Byte 1 is of the form |PENSIZE|OFFSET|TEXTTAG|.
    // PENSIZE (2 bits): Pen size (0 = small, 1 = standard, 2 = large).
    // OFFSET (2 bits): Subscript/normal/superscript (unused in this decoder).
    // TEXTTAG (4 bits): Text tag (unused in this decoder).
    // Byte 2 is of the form |I|U|EDTYP|FNTAG|.
    // I (1 bit): Italics toggle.
    // U (1 bit): Underline toggle.
    // EDTYP (3 bits): Edge type.
    // FNTAG (3 bits): Font tag.
    // More info at https://en.wikipedia.org/wiki/CEA-708#SetPenAttributes_(0x90_+_2_bytes)

    const attrByte1 = dtvccPacket.readByte().value;
    const attrByte2 = dtvccPacket.readByte().value;

    if (!this.currentWindow_) {
      return;
    }

    const penSize = (attrByte1 & 0xc0) >> 6;
    const italics = (attrByte2 & 0x80) > 0;
    const underline = (attrByte2 & 0x40) > 0;
    const edgeType = (attrByte2 & 0x38) >> 3;
    const fontStyle = attrByte2 & 0x07;

    this.currentWindow_.setPenItalics(italics);
    this.currentWindow_.setPenUnderline(underline);
    this.currentWindow_.setPenSize(penSize);
    this.currentWindow_.setPenFontStyle(fontStyle);
    this.currentWindow_.setPenEdgeType(edgeType);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenColor_(dtvccPacket) {
    // Read foreground and background properties.
    const foregroundByte = dtvccPacket.readByte().value;
    const backgroundByte = dtvccPacket.readByte().value;
    dtvccPacket.skip(1); // Edge color not supported, skip it.

    if (!this.currentWindow_) {
      return;
    }

    // Byte semantics are described at the following link:
    // https://en.wikipedia.org/wiki/CEA-708#SetPenColor_(0x91_+_3_bytes)

    // Foreground color properties: |FOP|F_R|F_G|F_B|.
    const foregroundBlue = foregroundByte & 0x03;
    const foregroundGreen = (foregroundByte & 0x0c) >> 2;
    const foregroundRed = (foregroundByte & 0x30) >> 4;

    // Background color properties: |BOP|B_R|B_G|B_B|.
    const backgroundBlue = backgroundByte & 0x03;
    const backgroundGreen = (backgroundByte & 0x0c) >> 2;
    const backgroundRed = (backgroundByte & 0x30) >> 4;

    const foregroundColor = this.rgbColorToCssColor_(
        foregroundRed, foregroundGreen, foregroundBlue);

    const backgroundColor = this.rgbColorToCssColor_(
        backgroundRed, backgroundGreen, backgroundBlue);

    this.currentWindow_.setPenTextColor(foregroundColor);
    this.currentWindow_.setPenBackgroundColor(backgroundColor);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenLocation_(dtvccPacket) {
    // Following 2 bytes take the following form:
    // b1 = |0|0|0|0|ROW| and b2 = |0|0|COLUMN|
    const locationByte1 = dtvccPacket.readByte().value;
    const locationByte2 = dtvccPacket.readByte().value;

    if (!this.currentWindow_) {
      return;
    }

    const row = locationByte1 & 0x0f;
    const col = locationByte2 & 0x3f;
    this.currentWindow_.setPenLocation(row, col);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setWindowAttributes_(dtvccPacket) {
    // 4 bytes follow, with the following form:
    // Byte 1 = |FILL_OPACITY|FILL_R|FILL_G|FILL_B| : window fill color/opacity.
    // Byte 2 contains border color/type information. Unused in this decoder.
    // Byte 3 = |BORDER_TYPE2|WORD_WRAP|PRINT_DIR|SCROLL_DIR|JUSTIFY| : the last
    // 2 bits are text justification, and bit 0x40 is the word-wrap flag.
    // Byte 4 is special effects. Unused in this decoder.
    // More info at https://en.wikipedia.org/wiki/CEA-708#SetWindowAttributes_(0x97_+_4_bytes)
    const b1 = dtvccPacket.readByte().value;
    dtvccPacket.skip(1); // Border colors not supported, skip.
    const b3 = dtvccPacket.readByte().value;
    dtvccPacket.skip(1); // Effects not supported, skip.

    if (!this.currentWindow_) {
      return;
    }

    // Fill color properties: |FILL_OPACITY|FILL_R|FILL_G|FILL_B|, with the same
    // 2-bits-per-channel encoding as SetPenColor.
    const fillOpacity = (b1 & 0xc0) >> 6;
    const fillBlue = b1 & 0x03;
    const fillGreen = (b1 & 0x0c) >> 2;
    const fillRed = (b1 & 0x30) >> 4;

    // Transparent fill clears the window background; otherwise map the color.
    const fillColor =
        fillOpacity === shaka.cea.Cea708Service.FILL_OPACITY_TRANSPARENT ?
        '' : this.rgbColorToCssColor_(fillRed, fillGreen, fillBlue);
    this.currentWindow_.setWindowFillColor(fillColor);

    const wordWrap = (b3 & 0x40) > 0;
    this.currentWindow_.setWordWrap(wordWrap);

    // Extract the text justification and set it on the window.
    const justification =
      /** @type {!shaka.cea.Cea708Window.TextJustification} */ (b3 & 0x03);
    this.currentWindow_.setJustification(justification);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {number} windowNum
   * @param {number} pts
   * @throws {!shaka.util.Error}
   * @private
   */
  defineWindow_(dtvccPacket, windowNum, pts) {
    // Create the window if it doesn't exist.
    const windowAlreadyExists = this.windows_[windowNum] !== null;
    if (!windowAlreadyExists) {
      const window = new shaka.cea.Cea708Window(windowNum, this.serviceNumber_);
      window.setStartTime(pts);
      this.windows_[windowNum] = window;
    }

    // 6 Bytes follow, with the following form:
    // b1 = |0|0|V|R|C|PRIOR| , b2 = |P|VERT_ANCHOR| , b3 = |HOR_ANCHOR|
    // b4 = |ANC_ID|ROW_CNT| , b5 = |0|0|COL_COUNT| , b6 = |0|0|WNSTY|PNSTY|
    // Semantics of these bytes at https://en.wikipedia.org/wiki/CEA-708#DefineWindow07_(0x98-0x9F,_+_6_bytes)
    const b1 = dtvccPacket.readByte().value;
    const b2 = dtvccPacket.readByte().value;
    const b3 = dtvccPacket.readByte().value;
    const b4 = dtvccPacket.readByte().value;
    const b5 = dtvccPacket.readByte().value;
    const b6 = dtvccPacket.readByte().value;

    // As per 8.4.7 of CEA-708-E, row locks and column locks are to be ignored.
    // So this decoder will ignore these values.

    const visible = (b1 & 0x20) > 0;
    const verticalAnchor = b2 & 0x7f;
    const relativeToggle = (b2 & 0x80) > 0;
    const horAnchor = b3;
    const rowCount = (b4 & 0x0f) + 1; // Spec says to add 1.
    const anchorId = (b4 & 0xf0) >> 4;
    const colCount = (b5 & 0x3f) + 1; // Spec says to add 1.
    const windowStyle = (b6 & 0x38) >> 3; // WNSTY: predefined window style id.
    const penStyle = b6 & 0x07; // PNSTY: predefined pen style id.

    const window = /** @type {!shaka.cea.Cea708Window} */ (
      this.windows_[windowNum]);

    window.defineWindow(visible, verticalAnchor,
        horAnchor, anchorId, relativeToggle, rowCount, colCount);

    // WNSTY 0 keeps the prior style on an existing window; new windows default
    // to style 1.
    this.applyWindowStylePreset_(window,
        windowAlreadyExists ? windowStyle : (windowStyle || 1));

    // PNSTY 0 keeps the current pen on an existing window.
    if (!windowAlreadyExists || penStyle !== 0) {
      this.applyPenStylePreset_(window, penStyle || 1);
    }

    this.currentWindow_ = window;
  }

  /**
   * Applies a predefined window style (WNSTY). Preset 0 leaves the current
   * style unchanged.
   * @param {!shaka.cea.Cea708Window} window
   * @param {number} presetId 0-7. 0 keeps the existing style.
   * @private
   */
  applyWindowStylePreset_(window, presetId) {
    if (presetId === 0) {
      return;
    }
    const preset = shaka.cea.Cea708Service.WindowStylePresets[presetId];
    if (!preset) {
      return;
    }
    window.setPrintDirection(preset.printDirection);
    window.setScrollDirection(preset.scrollDirection);
    window.setWordWrap(preset.wordWrap);
  }

  /**
   * Applies a predefined pen style (PNSTY). Unknown ids fall back to preset 1.
   * @param {!shaka.cea.Cea708Window} window
   * @param {number} presetId 1-7.
   * @private
   */
  applyPenStylePreset_(window, presetId) {
    const preset = shaka.cea.Cea708Service.PenStylePresets[presetId] ||
        shaka.cea.Cea708Service.PenStylePresets[1];

    window.resetPen();

    window.setPenSize(preset.penSize);
    window.setPenFontStyle(preset.fontStyle);
    window.setPenEdgeType(preset.edgeType);
  }

  /**
   * Maps 64 possible CEA-708 colors to 8 CSS colors.
   * @param {number} red value from 0-3
   * @param {number} green value from 0-3
   * @param {number} blue value from 0-3
   * @return {string}
   * @private
   */
  rgbColorToCssColor_(red, green, blue) {
    // Rather than supporting 64 colors, this decoder supports 8 colors and
    // gets the closest color, as per 9.19 of CEA-708-E. This is because some
    // colors on television such as white, are often sent with lower intensity
    // and often appear dull/greyish on the browser, making them hard to read.

    // As per CEA-708-E 9.19, quantize each 2-bit channel (0-3) to a single
    // bit: 0,1 -> 0 and 2,3 -> 1, which is exactly a right shift by one.
    const colorCode =
        ((red >> 1) << 2) | ((green >> 1) << 1) | (blue >> 1);
    return shaka.cea.Cea708Service.Colors[colorCode];
  }
};

/**
 * @private @const {number}
 */
shaka.cea.Cea708Service.ASCII_BACKSPACE = 0x08;

/**
 * @private @const {number}
 */
shaka.cea.Cea708Service.ASCII_FORM_FEED = 0x0c;

/**
 * @private @const {number}
 */
shaka.cea.Cea708Service.ASCII_CARRIAGE_RETURN = 0x0d;

/**
 * @private @const {number}
 */
shaka.cea.Cea708Service.ASCII_HOR_CARRIAGE_RETURN = 0x0e;

/**
 * For extended control codes in block_data on CEA-708, byte 1 is 0x10.
 * @private @const {number}
 */
shaka.cea.Cea708Service.EXT_CEA708_CTRL_CODE_BYTE1 = 0x10;

/**
 * SetWindowAttributes fill-opacity id for a fully transparent window fill
 * (CTA-708-E §8.4.2). A transparent fill means no background is drawn.
 * @private @const {number}
 */
shaka.cea.Cea708Service.FILL_OPACITY_TRANSPARENT = 3;

/**
 * Holds characters mapping for bytes that are G2 control codes.
 * @private @const {!Map<number, string>}
 */
shaka.cea.Cea708Service.G2Charset = new Map([
  [0x20, ' '], [0x21, '\xa0'], [0x25, '…'], [0x2a, 'Š'], [0x2c, 'Œ'],
  [0x30, '█'], [0x31, '‘'], [0x32, '’'], [0x33, '“'], [0x34, '”'],
  [0x35, '•'], [0x39, '™'], [0x3a, 'š'], [0x3c, 'œ'], [0x3d, '℠'],
  [0x3f, 'Ÿ'], [0x76, '⅛'], [0x77, '⅜'], [0x78, '⅝'], [0x79, '⅞'],
  [0x7a, '│'], [0x7b, '┐'], [0x7c, '└'], [0x7d, '─'], [0x7e, '┘'], [0x7f, '┌'],
]);

/**
 * An array of 8 colors that 64 colors can be quantized to. Order here matters.
 * @private @const {!Array<string>}
 */
shaka.cea.Cea708Service.Colors = [
  'black', 'blue', 'green', 'cyan',
  'red', 'magenta', 'yellow', 'white',
];

/**
 * A predefined window style (WNSTY) as defined by CTA-708-E §8.6.2.
 * Print/scroll directions use the CTA-708 direction encoding:
 * 0 = left-to-right, 1 = right-to-left, 2 = top-to-bottom, 3 = bottom-to-top.
 * @typedef {{
 *   justification: number,
 *   printDirection: number,
 *   scrollDirection: number,
 *   wordWrap: boolean,
 * }}
 *
 * @property {number} justification
 *   Text justification (CTA-708-E §8.4.3): 0 = left, 1 = right, 2 = center,
 *   3 = full.
 * @property {number} printDirection Direction text is printed.
 * @property {number} scrollDirection Direction the window scrolls/effects.
 * @property {boolean} wordWrap Whether the window wraps words.
 */
shaka.cea.Cea708Service.WindowStylePreset;

/**
 * The 7 predefined window styles (presetId 1-7) from CTA-708-E §8.6.2, indexed
 * by preset id (index 0 is unused). Styles 1, 2, 4 and 5 are left-justified,
 * styles 3 and 6 are centered, and style 7 is the "ticker tape" style that
 * prints top-to-bottom and scrolls right-to-left.
 * @const {!Array<?shaka.cea.Cea708Service.WindowStylePreset>}
 */
shaka.cea.Cea708Service.WindowStylePresets = [
  null, // Index 0 is unused; style ids start at 1.
  // 1: NTSC-style pop-up captions.
  {justification: 0, printDirection: 0, scrollDirection: 3, wordWrap: false},
  // 2: Pop-up captions without a black background.
  {justification: 0, printDirection: 0, scrollDirection: 3, wordWrap: false},
  // 3: NTSC-style centered pop-up captions.
  {justification: 2, printDirection: 0, scrollDirection: 3, wordWrap: false},
  // 4: NTSC-style roll-up captions.
  {justification: 0, printDirection: 0, scrollDirection: 3, wordWrap: true},
  // 5: Roll-up captions without a black background.
  {justification: 0, printDirection: 0, scrollDirection: 3, wordWrap: true},
  // 6: NTSC-style centered roll-up captions.
  {justification: 2, printDirection: 0, scrollDirection: 3, wordWrap: true},
  // 7: Ticker-tape captions.
  {justification: 0, printDirection: 2, scrollDirection: 1, wordWrap: false},
];

/**
 * A predefined pen style (PNSTY) as defined by CTA-708-E §8.6.3.
 * @typedef {{
 *   penSize: number,
 *   fontStyle: number,
 *   edgeType: number,
 * }}
 *
 * @property {number} penSize Pen size: 0 = small, 1 = standard, 2 = large.
 * @property {number} fontStyle Font style/tag (0 = default/undefined font).
 * @property {number} edgeType Pen edge type (0 = none, 3 = uniform, etc.).
 */
shaka.cea.Cea708Service.PenStylePreset;

/**
 * The 7 predefined pen styles (presetId 1-7) from CTA-708-E §8.6.3, indexed by
 * preset id (index 0 is unused). All predefined pen styles use the standard
 * pen size; they differ by font style and, for styles 6 and 7, a uniform edge.
 * @const {!Array<?shaka.cea.Cea708Service.PenStylePreset>}
 */
shaka.cea.Cea708Service.PenStylePresets = [
  null, // Index 0 is unused; style ids start at 1.
  // 1: Default (undefined) font, no edge.
  {penSize: 1, fontStyle: 0, edgeType: 0},
  // 2: Monospaced font with serifs.
  {penSize: 1, fontStyle: 1, edgeType: 0},
  // 3: Proportionally spaced font with serifs.
  {penSize: 1, fontStyle: 2, edgeType: 0},
  // 4: Monospaced font without serifs.
  {penSize: 1, fontStyle: 3, edgeType: 0},
  // 5: Proportionally spaced font without serifs.
  {penSize: 1, fontStyle: 4, edgeType: 0},
  // 6: Monospaced font without serifs, uniform edge.
  {penSize: 1, fontStyle: 3, edgeType: 3},
  // 7: Proportionally spaced font without serifs, uniform edge.
  {penSize: 1, fontStyle: 4, edgeType: 3},
];

/**
 * CEA-708 closed captions byte.
 * @typedef {{
 *   pts: number,
 *   type: number,
 *   value: number,
 *   order: number,
 * }}
 *
 * @property {number} pts
 *   Presentation timestamp (in second) at which this packet was received.
 * @property {number} type
 *   Type of the byte. Either 2 or 3, DTVCC Packet Data or a DTVCC Packet Start.
 * @property {number} value The byte containing data relevant to the packet.
 * @property {number} order
 *   A number indicating the order this packet was received in a sequence
 *   of packets. Used to break ties in a stable sorting algorithm
 */
shaka.cea.Cea708Service.Cea708Byte;
