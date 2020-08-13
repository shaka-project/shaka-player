goog.provide('shaka.cea.CeaDecoderUtils');
goog.provide('shaka.cea.CeaDecoderUtils.StyledChar');

shaka.cea.CeaDecoderUtils = class {
  /**
   * Emits a closed caption based on the state of the buffer.
   * @param {!shaka.text.Cue} topLevelCue
   * @param {!string} stream
   * @param {!Array<!Array<?shaka.cea.CeaDecoderUtils.StyledChar>>} memory
   * @param {!number} startTime Start time of the cue.
   * @param {!number} endTime End time of the cue.
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   */
  static getParsedCaption(topLevelCue, stream, memory, startTime, endTime) {
    // Find the first and last row that contains characters.
    let firstNonEmptyRow = -1;
    let lastNonEmptyRow = -1;

    for (let i = 0; i < memory.length; i++) {
      if (memory[i].some((e) => e != null)) {
        firstNonEmptyRow = i;
        break;
      }
    }

    for (let i = memory.length - 1; i >= 0; i--) {
      if (memory[i].some((e) => e != null)) {
        lastNonEmptyRow = i;
        break;
      }
    }

    // Exit early if no non-empty row was found.
    if (firstNonEmptyRow === -1 || lastNonEmptyRow === -1) {
      return null;
    }

    // Keeps track of the current styles for a cue being emitted.
    let currentUnderline = false;
    let currentItalics = false;
    let currentTextColor = shaka.cea.Cea608Memory.DEFAULT_TXT_COLOR;
    let currentBackgroundColor = shaka.cea.Cea608Memory.DEFAULT_BG_COLOR;

    // Create first cue that will be nested in top level cue. Default styles.
    let currentCue = shaka.cea.CeaDecoderUtils.createStyledCue(
        startTime, endTime, currentUnderline, currentItalics,
        currentTextColor, currentBackgroundColor);

    // Logic: Reduce rows into a single top level cue containing nested cues.
    // Each nested cue corresponds either a style change or a line break.

    for (let i = firstNonEmptyRow; i <= lastNonEmptyRow; i++) {
      for (const styledChar of memory[i]) {
        if (!styledChar) {
          continue;
        }
        const underline = styledChar.isUnderlined();
        const italics = styledChar.isItalicized();
        const textColor = styledChar.getTextColor();
        const backgroundColor = styledChar.getBackgroundColor();

        // If any style properties have changed, we need to open a new cue.
        if (underline != currentUnderline || italics != currentItalics ||
            textColor != currentTextColor ||
            backgroundColor != currentBackgroundColor) {
          // Push the currently built cue and start a new cue, with new styles.
          if (currentCue.payload) {
            topLevelCue.nestedCues.push(currentCue);
          }
          currentCue = shaka.cea.CeaDecoderUtils.createStyledCue(
              startTime, endTime, underline,
              italics, textColor, backgroundColor);

          currentUnderline = underline;
          currentItalics = italics;
          currentTextColor = textColor;
          currentBackgroundColor = backgroundColor;
        }

        currentCue.payload += styledChar.getChar();
      }
      if (currentCue.payload) {
        topLevelCue.nestedCues.push(currentCue);
      }

      // Create and push a linebreak cue to create a new line.
      if (i !== lastNonEmptyRow) {
        const spacerCue = new shaka.text.Cue(
            startTime, endTime, /* payload= */ '');
        spacerCue.spacer = true;
        topLevelCue.nestedCues.push(spacerCue);
      }

      // Create a new cue.
      currentCue = shaka.cea.CeaDecoderUtils.createStyledCue(
          startTime, endTime, currentUnderline, currentItalics,
          currentTextColor, currentBackgroundColor);
    }

    if (topLevelCue.nestedCues.length) {
      return {
        cue: topLevelCue,
        stream,
      };
    }

    return null;
  }

  /**
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!boolean} underline
   * @param {!boolean} italics
   * @param {!string} txtColor
   * @param {!string} bgColor
   * @return {!shaka.text.Cue}
   */
  static createStyledCue(startTime, endTime, underline,
      italics, txtColor, bgColor) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    if (underline) {
      cue.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);
    }
    if (italics) {
      cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    }
    cue.color = txtColor;
    cue.backgroundColor = bgColor;
    return cue;
  }
};

shaka.cea.CeaDecoderUtils.StyledChar = class {
  constructor(character, underline, italics, backgroundColor, textColor) {
    /**
       * @private {!string}
       */
    this.character_ = character;

    /**
       * @private {!boolean}
       */
    this.underline_ = underline;

    /**
       * @private {!boolean}
       */
    this.italics_ = italics;

    /**
       * @private {!string}
       */
    this.backgroundColor_ = backgroundColor;

    /**
       * @private {!string}
       */
    this.textColor_ = textColor;
  }

  /**
     * @return {!string}
     */
  getChar() {
    return this.character_;
  }

  /**
     * @return {!boolean}
     */
  isUnderlined() {
    return this.underline_;
  }

  /**
     * @return {!boolean}
     */
  isItalicized() {
    return this.italics_;
  }

  /**
     * @return {!string}
     */
  getBackgroundColor() {
    return this.backgroundColor_;
  }

  /**
     * @return {!string}
     */
  getTextColor() {
    return this.textColor_;
  }
};
