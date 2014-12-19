/**
 * Copyright 2014 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @fileoverview Implements a media presentation description object.
 */

goog.provide('shaka.dash.mpd');

goog.require('goog.Uri');
goog.require('shaka.log');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.Pssh');
goog.require('shaka.util.StringUtils');


/**
 * Creates an Mpd. The MPD XML text is parsed into a tree structure.
 *
 * If a tag that should only exist once exists more than once, then all
 * instances of that tag are ignored; for example, if a "Representation" tag
 * contains more than one "SegmentBase" tag, then every "SegmentBase" tag
 * contained in that "Representation" tag is ignored.
 *
 * Numbers, times, and byte ranges are set to null if they cannot be parsed.
 *
 * @param {string} source The MPD XML text.
 * @param {string} url The MPD URL for relative BaseURL resolution.
 * @return {shaka.dash.mpd.Mpd}
 *
 * @see ISO/IEC 23009-1
 */
shaka.dash.mpd.parseMpd = function(source, url) {
  var parser = new DOMParser();
  var xml = parser.parseFromString(source, 'text/xml');

  if (!xml) {
    shaka.log.error('Failed to parse MPD XML.');
    return null;
  }

  // Reset the unique IDs so that IDs are predictable no matter how many MPDs
  // are parsed in this browser session.
  shaka.dash.mpd.nextUniqueId_ = 0;

  // Construct a virtual parent for the MPD to use in resolving relative URLs.
  var parent = { baseUrl: new goog.Uri(url) };

  return shaka.dash.mpd.parseChild_(parent, xml, shaka.dash.mpd.Mpd);
};


/** @private {number} */
shaka.dash.mpd.nextUniqueId_ = 0;


/**
 * @private {number}
 * @const
 */
shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_ = 5.0;



/** @constructor */
shaka.dash.mpd.Mpd = function() {
  /** @type {?string} */
  this.id = null;

  /** @type {?string} */
  this.type = null;

  /** @type {goog.Uri} */
  this.baseUrl = null;

  /**
   * The duration in seconds.
   * @type {?number}
   */
  this.duration = null;

  /**
   * Time in seconds that should be buffered before playback begins, to assure
   * uninterrupted playback.
   * @type {number}
   */
  this.minBufferTime = shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_;

  /** @type {!Array.<!shaka.dash.mpd.Period>} */
  this.periods = [];
};



/** @constructor */
shaka.dash.mpd.Period = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * Never seen on the Period itself, but inherited from Mpd for convenience.
   * @see Mpd.minBufferTime
   * @type {number}
   */
  this.minBufferTime = shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_;

  /**
   * The start time in seconds.
   * @type {?number}
   */
  this.start = null;

  /**
   * The duration in seconds.
   * @type {?number}
   */
  this.duration = null;

  /** @type {goog.Uri} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.AdaptationSet>} */
  this.adaptationSets = [];
};



/** @constructor */
shaka.dash.mpd.AdaptationSet = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * Never seen on the AdaptationSet itself, but inherited from Mpd for
   * convenience.
   * @see Mpd.minBufferTime
   * @type {number}
   */
  this.minBufferTime = shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_;

  /**
   * The language.
   * @type {?string}
   * @see IETF RFC 5646
   * @see ISO 639
   */
  this.lang = null;

  /**
   * Should be 'video' or 'audio', not a MIME type.
   * If not specified, will be inferred from the MIME type.
   * @type {?string}
   */
  this.contentType = null;

  /** @type {?number} */
  this.width = null;

  /** @type {?number} */
  this.height = null;

  /**
   * If not specified, will be inferred from the first representation.
   * @type {?string}
   */
  this.mimeType = null;

  /** @type {?string} */
  this.codecs = null;

  /** @type {goog.Uri} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.ContentProtection>} */
  this.contentProtections = [];

  /** @type {*} */
  this.userData = null;

  /** @type {!Array.<!shaka.dash.mpd.Representation>} */
  this.representations = [];
};



/** @constructor */
shaka.dash.mpd.ContentComponent = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * The language.
   * @type {?string}
   * @see IETF RFC 5646
   * @see ISO 639
   */
  this.lang = null;

  /**
   * Should be 'video' or 'audio', not a MIME type.
   * @type {?string}
   */
  this.contentType = null;
};



/** @constructor */
shaka.dash.mpd.Representation = function() {
  /** @type {?string} */
  this.id = null;

  /**
   * Never seen on the Representation itself, but inherited from AdapationSet
   * for convenience.
   * @see AdaptationSet.lang
   * @type {?string}
   */
  this.lang = null;

  /**
   * Never seen on the Representation itself, but inherited from Mpd for
   * convenience.
   * @see Mpd.minBufferTime
   * @type {number}
   */
  this.minBufferTime = shaka.dash.mpd.DEFAULT_MIN_BUFFER_TIME_;

  /**
   * Bandwidth required, in bits per second, to assure uninterrupted playback,
   * assuming that Mpd.minBufferTime seconds of video are in buffer before
   * playback begins.
   * @type {?number}
   */
  this.bandwidth = null;

  /** @type {?number} */
  this.width = null;

  /** @type {?number} */
  this.height = null;

  /** @type {?string} */
  this.mimeType = null;

  /** @type {?string} */
  this.codecs = null;

  /** @type {goog.Uri} */
  this.baseUrl = null;

  /** @type {shaka.dash.mpd.SegmentBase} */
  this.segmentBase = null;

  /** @type {shaka.dash.mpd.SegmentList} */
  this.segmentList = null;

  /** @type {shaka.dash.mpd.SegmentTemplate} */
  this.segmentTemplate = null;

  /** @type {!Array.<!shaka.dash.mpd.ContentProtection>} */
  this.contentProtections = [];

  /** @type {*} */
  this.userData = null;

  /**
   * A unique ID independent of |id| or other attributes.
   * @type {number}
   */
  this.uniqueId = ++shaka.dash.mpd.nextUniqueId_;
};



/** @constructor */
shaka.dash.mpd.ContentProtection = function() {
  /**
   * @type {?string}
   * @expose
   */
  this.schemeIdUri = null;

  /** @type {?string} */
  this.value = null;

  /** @type {!Array.<!Node>} */
  this.children = [];

  /**
   * @type {shaka.dash.mpd.CencPssh}
   * @expose
   */
  this.pssh = null;
};



/** @constructor */
shaka.dash.mpd.CencPssh = function() {
  /**
   * @type {Uint8Array}
   * @expose
   */
  this.psshBox = null;

  /**
   * @type {shaka.util.Pssh}
   * @expose
   */
  this.parsedPssh = null;
};



/** @constructor */
shaka.dash.mpd.BaseUrl = function() {
  /** @type {?string} */
  this.url = null;
};



/** @constructor */
shaka.dash.mpd.SegmentBase = function() {
  /**
   * This not an actual XML attribute of SegmentBase. It is inherited from the
   * SegmentBase's parent Representation.
   * @type {goog.Uri}
   */
  this.baseUrl = null;

  /**
   * This is not an actual XML attribute of SegmentBase. It is either inherited
   * from the SegmentBase's parent Representation or generated from a
   * SegmentTemplate.
   * @type {goog.Uri}
   */
  this.mediaUrl = null;

  /** @type {shaka.dash.mpd.Range} */
  this.indexRange = null;

  /** @type {shaka.dash.mpd.RepresentationIndex} */
  this.representationIndex = null;

  /** @type {shaka.dash.mpd.Initialization} */
  this.initialization = null;
};



/** @constructor */
shaka.dash.mpd.RepresentationIndex = function() {
  /** @type {goog.Uri} */
  this.url = null;

  /**
   * Inherits the value of SegmentBase.indexRange if not specified.
   * @type {shaka.dash.mpd.Range}
   */
  this.range = null;
};



/** @constructor */
shaka.dash.mpd.Initialization = function() {
  /** @type {goog.Uri} */
  this.url = null;

  /** @type {shaka.dash.mpd.Range} */
  this.range = null;
};



/** @constructor */
shaka.dash.mpd.SegmentList = function() {
  /**
   * This not an actual XML attribute of SegmentList. It is inherited from the
   * SegmentList's parent Representation.
   * @type {goog.Uri}
   */
  this.baseUrl = null;

  /** @type {number} */
  this.timescale = 1;

  /** @type {number} */
  this.presentationTimeOffset = 0;

  /** @type {?number} */
  this.segmentDuration = null;

  /** @type {number} */
  this.firstSegmentNumber = 1;

  /** @type {shaka.dash.mpd.Initialization} */
  this.initialization = null;

  /** @type {!Array.<!shaka.dash.mpd.SegmentUrl>} */
  this.segmentUrls = [];

  /** @type {*} */
  this.userData = null;
};



/** @constructor */
shaka.dash.mpd.SegmentUrl = function() {
  /** @type {goog.Uri} */
  this.mediaUrl = null;

  /** @type {shaka.dash.mpd.Range} */
  this.mediaRange = null;

  /**
   * This is not an actual XML attribute. It is either left null or generated
   * from a SegmentTemplate.
   * @type {?number}
   */
  this.startTime = null;

  /**
   * This is not an actual XML attribute. It is either left null or generated
   * from a SegmentTemplate.
   * @type {?number}
   */
  this.duration = null;
};



/** @constructor */
shaka.dash.mpd.SegmentTemplate = function() {
  /** @type {number} */
  this.timescale = 1;

  /** @type {number} */
  this.presentationTimeOffset = 0;

  /** @type {?number} */
  this.segmentDuration = null;

  /** @type {number} */
  this.firstSegmentNumber = 1;

  /** @type {?string} */
  this.mediaUrlTemplate = null;

  /** @type {?string} */
  this.indexUrlTemplate = null;

  /** @type {?string} */
  this.initializationUrlTemplate = null;

  /** @type {shaka.dash.mpd.SegmentTimeline} */
  this.timeline = null;
};



/** @constructor */
shaka.dash.mpd.SegmentTimeline = function() {
  /** @type {!Array.<!shaka.dash.mpd.SegmentTimePoint>} */
  this.timePoints = [];
};



/** @constructor */
shaka.dash.mpd.SegmentTimePoint = function() {
  /** @type {?number} */
  this.startTime = null;

  /** @type {?number} */
  this.duration = null;

  /** @type {?number} */
  this.repeat = null;
};



/**
 * Creates a Range.
 * @param {number} begin The beginning of the range.
 * @param {number} end The end of the range.
 * @constructor
 */
shaka.dash.mpd.Range = function(begin, end) {
  /** @type {number} */
  this.begin = begin;

  /** @type {number} */
  this.end = end;
};


// MPD tag names --------------------------------------------------------------


/**
 * @const {string}
 * @expose all TAG_NAME properties so that they do not get stripped during
 *     advanced compilation.
 */
shaka.dash.mpd.Mpd.TAG_NAME = 'MPD';


/** @const {string} */
shaka.dash.mpd.Period.TAG_NAME = 'Period';


/** @const {string} */
shaka.dash.mpd.AdaptationSet.TAG_NAME = 'AdaptationSet';


/** @const {string} */
shaka.dash.mpd.ContentComponent.TAG_NAME = 'ContentComponent';


/** @const {string} */
shaka.dash.mpd.Representation.TAG_NAME = 'Representation';


/** @const {string} */
shaka.dash.mpd.ContentProtection.TAG_NAME = 'ContentProtection';


/** @const {string} */
shaka.dash.mpd.CencPssh.TAG_NAME = 'cenc:pssh';


/** @const {string} */
shaka.dash.mpd.BaseUrl.TAG_NAME = 'BaseURL';


/** @const {string} */
shaka.dash.mpd.SegmentBase.TAG_NAME = 'SegmentBase';


/** @const {string} */
shaka.dash.mpd.RepresentationIndex.TAG_NAME = 'RepresentationIndex';


/** @const {string} */
shaka.dash.mpd.Initialization.TAG_NAME = 'Initialization';


/** @const {string} */
shaka.dash.mpd.SegmentList.TAG_NAME = 'SegmentList';


/** @const {string} */
shaka.dash.mpd.SegmentUrl.TAG_NAME = 'SegmentURL';


/** @const {string} */
shaka.dash.mpd.SegmentTemplate.TAG_NAME = 'SegmentTemplate';


/** @const {string} */
shaka.dash.mpd.SegmentTimeline.TAG_NAME = 'SegmentTimeline';


/** @const {string} */
shaka.dash.mpd.SegmentTimePoint.TAG_NAME = 'S';


// MPD tag parsing functions --------------------------------------------------


/**
 * Parses an "MPD" tag.
 * @param {!Object} parent A virtual parent tag containing a BaseURL which
 *     refers to the MPD resource itself.
 * @param {!Node} elem The MPD XML element.
 */
shaka.dash.mpd.Mpd.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.type = mpd.parseAttr_(elem, 'type', mpd.parseString_);
  this.duration =
      mpd.parseAttr_(elem, 'mediaPresentationDuration', mpd.parseDuration_);
  this.minBufferTime =
      mpd.parseAttr_(elem, 'minBufferTime', mpd.parseDuration_) ||
      mpd.DEFAULT_MIN_BUFFER_TIME_;

  // Parse simple child elements.
  var baseUrl = mpd.parseChild_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrl_(parent.baseUrl, baseUrl ? baseUrl.url : null);

  // Parse hierarchical children.
  this.periods = mpd.parseChildren_(this, elem, mpd.Period);
};


/**
 * Parses a "Period" tag.
 * @param {!shaka.dash.mpd.Mpd} parent The parent Mpd.
 * @param {!Node} elem The Period XML element.
 */
shaka.dash.mpd.Period.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.start = mpd.parseAttr_(elem, 'start', mpd.parseDuration_);
  this.duration = mpd.parseAttr_(elem, 'duration', mpd.parseDuration_);

  // Never seen on this element itself, but inherited for convenience.
  this.minBufferTime = parent.minBufferTime;

  // Parse simple child elements.
  var baseUrl = mpd.parseChild_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrl_(parent.baseUrl, baseUrl ? baseUrl.url : null);

  // Parse hierarchical children.
  this.segmentBase = mpd.parseChild_(this, elem, mpd.SegmentBase);
  this.segmentList = mpd.parseChild_(this, elem, mpd.SegmentList);
  this.segmentTemplate = mpd.parseChild_(this, elem, mpd.SegmentTemplate);

  this.adaptationSets = mpd.parseChildren_(this, elem, mpd.AdaptationSet);
};


/**
 * Parses an "AdaptationSet" tag.
 * @param {!shaka.dash.mpd.Period} parent The parent Period.
 * @param {!Node} elem The AdaptationSet XML element.
 */
shaka.dash.mpd.AdaptationSet.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse children which provide properties of the AdaptationSet.
  var contentComponent = mpd.parseChild_(this, elem, mpd.ContentComponent) ||
                         {};

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.lang = mpd.parseAttr_(elem, 'lang', mpd.parseString_) ||
              contentComponent.lang;
  this.contentType = mpd.parseAttr_(elem, 'contentType', mpd.parseString_) ||
                     contentComponent.contentType;
  this.width = mpd.parseAttr_(elem, 'width', mpd.parsePositiveInt_);
  this.height = mpd.parseAttr_(elem, 'height', mpd.parsePositiveInt_);
  this.mimeType = mpd.parseAttr_(elem, 'mimeType', mpd.parseString_);
  this.codecs = mpd.parseAttr_(elem, 'codecs', mpd.parseString_);

  // Normalize the language tag.
  if (this.lang) this.lang = shaka.util.LanguageUtils.normalize(this.lang);

  // Never seen on this element itself, but inherited for convenience.
  this.minBufferTime = parent.minBufferTime;

  // Parse simple child elements.
  var baseUrl = mpd.parseChild_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrl_(parent.baseUrl, baseUrl ? baseUrl.url : null);

  this.contentProtections =
      mpd.parseChildren_(this, elem, mpd.ContentProtection);

  if (!this.contentType && this.mimeType) {
    // Infer contentType from mimeType. This must be done before parsing any
    // child Representations, as Representation inherits contentType.
    this.contentType = this.mimeType.split('/')[0];
  }

  // Parse hierarchical children.
  this.segmentBase = mpd.parseChild_(this, elem, mpd.SegmentBase) ||
                     parent.segmentBase;
  this.segmentList = mpd.parseChild_(this, elem, mpd.SegmentList) ||
                     parent.segmentList;
  this.segmentTemplate = mpd.parseChild_(this, elem, mpd.SegmentTemplate) ||
                         parent.segmentTemplate;

  this.representations = mpd.parseChildren_(this, elem, mpd.Representation);

  if (!this.mimeType && this.representations.length) {
    // Infer mimeType from children.  MpdProcessor will deal with the case
    // where Representations have inconsistent mimeTypes.
    this.mimeType = this.representations[0].mimeType;

    if (!this.contentType && this.mimeType) {
      this.contentType = this.mimeType.split('/')[0];
    }
  }
};


/**
 * Parses a "ContentComponent" tag.
 * @param {!shaka.dash.mpd.AdaptationSet} parent The parent AdaptationSet.
 * @param {!Node} elem The ContentComponent XML element.
 */
shaka.dash.mpd.ContentComponent.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.lang = mpd.parseAttr_(elem, 'lang', mpd.parseString_);
  this.contentType = mpd.parseAttr_(elem, 'contentType', mpd.parseString_);

  // Normalize the language tag.
  if (this.lang) this.lang = shaka.util.LanguageUtils.normalize(this.lang);
};


/**
 * Parses a "Representation" tag.
 * @param {!shaka.dash.mpd.AdaptationSet} parent The parent AdaptationSet.
 * @param {!Node} elem The Representation XML element.
 */
shaka.dash.mpd.Representation.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.id = mpd.parseAttr_(elem, 'id', mpd.parseString_);
  this.bandwidth = mpd.parseAttr_(elem, 'bandwidth', mpd.parsePositiveInt_);
  this.width =
      mpd.parseAttr_(elem, 'width', mpd.parsePositiveInt_) || parent.width;
  this.height =
      mpd.parseAttr_(elem, 'height', mpd.parsePositiveInt_) || parent.height;
  this.mimeType =
      mpd.parseAttr_(elem, 'mimeType', mpd.parseString_) || parent.mimeType;
  this.codecs =
      mpd.parseAttr_(elem, 'codecs', mpd.parseString_) || parent.codecs;

  // Never seen on this element itself, but inherited for convenience.
  this.lang = parent.lang;
  this.minBufferTime = parent.minBufferTime;

  // Parse simple child elements.
  var baseUrl = mpd.parseChild_(this, elem, mpd.BaseUrl);
  this.baseUrl = mpd.resolveUrl_(parent.baseUrl, baseUrl ? baseUrl.url : null);

  this.contentProtections =
      mpd.parseChildren_(this, elem, mpd.ContentProtection);

  // Parse hierarchical children.
  this.segmentBase = mpd.parseChild_(this, elem, mpd.SegmentBase) ||
                     parent.segmentBase;
  this.segmentList = mpd.parseChild_(this, elem, mpd.SegmentList) ||
                     parent.segmentList;
  this.segmentTemplate = mpd.parseChild_(this, elem, mpd.SegmentTemplate) ||
                         parent.segmentTemplate;

  if (this.contentProtections.length == 0) {
    this.contentProtections = parent.contentProtections;
  }
};


/**
 * Parses a "ContentProtection" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The ContentProtection XML element.
 */
shaka.dash.mpd.ContentProtection.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.schemeIdUri = mpd.parseAttr_(elem, 'schemeIdUri', mpd.parseString_);
  this.value = mpd.parseAttr_(elem, 'value', mpd.parseString_);

  // Parse simple child elements.
  this.pssh = mpd.parseChild_(this, elem, mpd.CencPssh);

  // NOTE: A given ContentProtection tag could contain anything, and a scheme
  // could be application-specific.  Therefore we must capture whatever it
  // contains, and let the application choose a scheme and map it to a key
  // system.
  this.children = elem.children;
};


/**
 * Parse a "cenc:pssh" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The CencPssh XML element.
 */
shaka.dash.mpd.CencPssh.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;
  var StringUtils = shaka.util.StringUtils;

  var contents = mpd.getContents_(elem);
  if (!contents) {
    return;
  }

  this.psshBox = StringUtils.toUint8Array(StringUtils.fromBase64(contents));

  try {
    this.parsedPssh = new shaka.util.Pssh(this.psshBox);
  } catch (exception) {
    if (!(exception instanceof RangeError)) {
      throw exception;
    }
  }
};


/**
 * Parses a "BaseURL" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The BaseURL XML element.
 */
shaka.dash.mpd.BaseUrl.prototype.parse = function(parent, elem) {
  this.url = shaka.dash.mpd.getContents_(elem);
};


/**
 * Parses a "SegmentBase" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentBase XML element.
 */
shaka.dash.mpd.SegmentBase.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.baseUrl = parent.baseUrl;
  this.mediaUrl = parent.baseUrl;

  // Parse attributes.
  this.indexRange = mpd.parseAttr_(elem, 'indexRange', mpd.parseRange_);

  // Parse simple child elements.
  this.representationIndex =
      mpd.parseChild_(this, elem, mpd.RepresentationIndex);

  this.initialization = mpd.parseChild_(this, elem, mpd.Initialization);

  if (this.representationIndex) {
    if (!this.representationIndex.range) {
      this.representationIndex.range = this.indexRange;
    }
  } else {
    // Normalize the SegmentBase by creating a default RepresentationIndex.
    this.representationIndex = new shaka.dash.mpd.RepresentationIndex();
    this.representationIndex.url = this.baseUrl;
    this.representationIndex.range = this.indexRange;
  }
};


/**
 * Parses a "RepresentationIndex" tag.
 * @param {!shaka.dash.mpd.SegmentBase} parent The parent SegmentBase.
 * @param {!Node} elem The RepresentationIndex XML element.
 */
shaka.dash.mpd.RepresentationIndex.prototype.parse = function(
    parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'sourceURL', mpd.parseString_);
  this.url = mpd.resolveUrl_(parent.baseUrl, url);

  this.range = mpd.parseAttr_(elem, 'range', mpd.parseRange_);
};


/**
 * Parses an "Initialization" tag.
 * @param {!shaka.dash.mpd.SegmentBase|!shaka.dash.mpd.SegmentList} parent
 *     The parent SegmentBase or parent SegmentList.
 * @param {!Node} elem The Initialization XML element.
 */
shaka.dash.mpd.Initialization.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'sourceURL', mpd.parseString_);
  this.url = mpd.resolveUrl_(parent.baseUrl, url);

  this.range = mpd.parseAttr_(elem, 'range', mpd.parseRange_);
};


/**
 * Parses a "SegmentList" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentList XML element.
 */
shaka.dash.mpd.SegmentList.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.baseUrl = parent.baseUrl;

  // Parse attributes.
  this.timescale =
      mpd.parseAttr_(elem, 'timescale', mpd.parsePositiveInt_) || 1;

  this.presentationTimeOffset = mpd.parseAttr_(
      elem, 'presentationTimeOffset', mpd.parseNonNegativeInt_) || 0;

  this.segmentDuration =
      mpd.parseAttr_(elem, 'duration', mpd.parseNonNegativeInt_);

  this.firstSegmentNumber =
      mpd.parseAttr_(elem, 'startNumber', mpd.parsePositiveInt_) || 1;

  // Parse simple children
  this.initialization = mpd.parseChild_(this, elem, mpd.Initialization);
  this.segmentUrls = mpd.parseChildren_(this, elem, mpd.SegmentUrl);
};


/**
 * Parses a "SegmentUrl" tag.
 * @param {!shaka.dash.mpd.SegmentList} parent The parent SegmentList.
 * @param {!Node} elem The SegmentUrl XML element.
 */
shaka.dash.mpd.SegmentUrl.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  var url = mpd.parseAttr_(elem, 'media', mpd.parseString_);
  this.mediaUrl = mpd.resolveUrl_(parent.baseUrl, url);

  this.mediaRange = mpd.parseAttr_(elem, 'mediaRange', mpd.parseRange_);
};


/**
 * Parses a "SegmentTemplate" tag.
 * @param {*} parent The parent object.
 * @param {!Node} elem The SegmentTemplate XML element.
 */
shaka.dash.mpd.SegmentTemplate.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.timescale =
      mpd.parseAttr_(elem, 'timescale', mpd.parsePositiveInt_) || 1;

  this.presentationTimeOffset = mpd.parseAttr_(
      elem, 'presentationTimeOffset', mpd.parseNonNegativeInt_) || 0;

  this.segmentDuration =
      mpd.parseAttr_(elem, 'duration', mpd.parseNonNegativeInt_);

  this.firstSegmentNumber =
      mpd.parseAttr_(elem, 'startNumber', mpd.parsePositiveInt_) || 1;

  this.mediaUrlTemplate = mpd.parseAttr_(elem, 'media', mpd.parseString_);
  this.indexUrlTemplate = mpd.parseAttr_(elem, 'index', mpd.parseString_);
  this.initializationUrlTemplate =
      mpd.parseAttr_(elem, 'initialization', mpd.parseString_);

  // Parse hierarchical children.
  this.timeline = mpd.parseChild_(this, elem, mpd.SegmentTimeline);
};


/**
 * Parses a "SegmentTimeline" tag.
 * @param {!shaka.dash.mpd.SegmentTemplate} parent The parent SegmentTemplate.
 * @param {!Node} elem The SegmentTimeline XML element.
 */
shaka.dash.mpd.SegmentTimeline.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  this.timePoints = mpd.parseChildren_(this, elem, mpd.SegmentTimePoint);
};


/**
 * Parses an "S" tag.
 * @param {!shaka.dash.mpd.SegmentTimeline} parent The parent SegmentTimeline.
 * @param {!Node} elem The SegmentTimePoint XML element.
 */
shaka.dash.mpd.SegmentTimePoint.prototype.parse = function(parent, elem) {
  var mpd = shaka.dash.mpd;

  // Parse attributes.
  this.startTime = mpd.parseAttr_(elem, 't', mpd.parseNonNegativeInt_);
  this.duration = mpd.parseAttr_(elem, 'd', mpd.parseNonNegativeInt_);
  this.repeat = mpd.parseAttr_(elem, 'r', mpd.parseNonNegativeInt_);
};


// MPD parsing utility functions ----------------------------------------------


/**
 * Resolves |urlString| relative to |baseUrl|.
 * @param {goog.Uri} baseUrl
 * @param {?string} urlString
 * @return {goog.Uri}
 * @private
 */
shaka.dash.mpd.resolveUrl_ = function(baseUrl, urlString) {
  var url = urlString ? new goog.Uri(urlString) : null;

  if (baseUrl) {
    return url ? baseUrl.resolve(url) : baseUrl;
  } else {
    return url;
  }
};


/**
 * Parses a child XML element.
 * @param {*} parent The parsed parent object.
 * @param {!Node} elem The parent XML element.
 * @param {function(new:T)} constructor The constructor of the parsed
 *     child XML element. The constructor must define the attribute "TAG_NAME".
 * @return {T} The parsed child XML element on success, or null if a child
 *     XML element does not exist with the given tag name OR if there exists
 *     more than one child XML element with the given tag name OR if the child
 *     XML element could not be parsed.
 * @template T
 * @private
 */
shaka.dash.mpd.parseChild_ = function(parent, elem, constructor) {
  var childElement = null;

  for (var i = 0; i < elem.children.length; i++) {
    if (elem.children[i].tagName != constructor.TAG_NAME) {
      continue;
    }
    if (childElement) {
      return null;
    }
    childElement = elem.children[i];
  }

  if (!childElement) {
    return null;
  }

  var parsedChild = new constructor();
  parsedChild.parse.call(parsedChild, parent, childElement);
  return parsedChild;
};


/**
 * Parses an array of child XML elements.
 * @param {*} parent The parsed parent object.
 * @param {!Node} elem The parent XML element.
 * @param {function(new:T)} constructor The constructor of each parsed child
 *     XML element. The constructor must define the attribute "TAG_NAME".
 * @return {!Array.<!T>} The parsed child XML elements.
 * @template T
 * @private
 */
shaka.dash.mpd.parseChildren_ = function(parent, elem, constructor) {
  var parsedChildren = [];

  for (var i = 0; i < elem.children.length; i++) {
    if (elem.children[i].tagName != constructor.TAG_NAME) {
      continue;
    }
    var parsedChild = new constructor();
    parsedChild.parse.call(parsedChild, parent, elem.children[i]);
    parsedChildren.push(parsedChild);
  }

  return parsedChildren;
};


/**
 * Gets an array of child XML elements by tag name, without parsing them.
 * @param {!Node} elem The parent XML element.
 * @param {string} tagName The tag name to filter by.
 * @return {!Array.<!Node>} The child XML elements.
 * @private
 */
shaka.dash.mpd.getChildren_ = function(elem, tagName) {
  var children = [];

  for (var i = 0; i < elem.children.length; i++) {
    if (elem.children[i].tagName != tagName) {
      continue;
    }
    children.push(elem.children[i]);
  }

  return children;
};


/**
 * Gets the text contents of a node.
 * @param {!Node} elem The XML element.
 * @return {?string} The text contents, or null if there are none.
 * @private
 */
shaka.dash.mpd.getContents_ = function(elem) {
  var contents = elem.firstChild;
  if (contents.nodeType != Node.TEXT_NODE) {
    return null;
  }

  return contents.nodeValue;
};


/**
 * Parses an attribute by its name.
 * @param {!Node} elem The XML element.
 * @param {string} name The attribute name.
 * @param {function(string): (T|null)} parseFunction A function to parse the
 *     attribute.
 * @return {(T|null)} The parsed attribute on success, or null if the
 *     attribute does not exist OR could not be parsed.
 * @template T
 * @private
 */
shaka.dash.mpd.parseAttr_ = function(elem, name, parseFunction) {
  return parseFunction(elem.getAttribute(name));
};


/**
 * Parses an XML duration string.
 * Note that months and years are not supported, nor are negative values.
 * @param {string} durationString The duration string, e.g., "PT1H3M43.2S",
 *     which means 1 hour, 3 minutes, and 43.2 seconds.
 * @return {?number} The parsed duration in seconds, or null if the duration
 *     string could not be parsed.
 * @see http://www.datypic.com/sc/xsd/t-xsd_duration.html
 * @private
 */
shaka.dash.mpd.parseDuration_ = function(durationString) {
  if (!durationString) {
    return null;
  }

  var regex =
      /^P(?:([0-9]*)D)?(?:T(?:([0-9]*)H)?(?:([0-9]*)M)?(?:([0-9.]*)S)?)?$/;
  var matches = regex.exec(durationString);

  if (!matches) {
    shaka.log.warning('Invalid duration string:', durationString);
    return null;
  }

  var duration = 0;

  var days = shaka.dash.mpd.parseNonNegativeInt_(matches[1]);
  if (days) {
    duration += 86400 * days;
  }

  var hours = shaka.dash.mpd.parseNonNegativeInt_(matches[2]);
  if (hours) {
    duration += 3600 * hours;
  }

  var minutes = shaka.dash.mpd.parseNonNegativeInt_(matches[3]);
  if (minutes) {
    duration += 60 * minutes;
  }

  var seconds = shaka.dash.mpd.parseFloat_(matches[4]);
  if (seconds) {
    duration += seconds;
  }

  return duration;
};


/**
 * Parses a range string.
 * @param {string} rangeString The range string, e.g., "101-9213"
 * @return {shaka.dash.mpd.Range} The parsed range, or null if the range string
 *     could not be parsed.
 * @private
 */
shaka.dash.mpd.parseRange_ = function(rangeString) {
  var matches = /([0-9]+)-([0-9]+)/.exec(rangeString);

  if (!matches) {
    return null;
  }

  var begin = shaka.dash.mpd.parseNonNegativeInt_(matches[1]);
  if (begin == null) {
    return null;
  }

  var end = shaka.dash.mpd.parseNonNegativeInt_(matches[2]);
  if (end == null) {
    return null;
  }

  return new shaka.dash.mpd.Range(begin, end);
};


/**
 * Parses a positive integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed positive integer on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.mpd.parsePositiveInt_ = function(intString) {
  var result = window.parseInt(intString, 10);
  return (result > 0 ? result : null);
};


/**
 * Parses a non-negative integer.
 * @param {string} intString The integer string.
 * @return {?number} The parsed non-negative integer on success; otherwise,
 *     return null.
 * @private
 */
shaka.dash.mpd.parseNonNegativeInt_ = function(intString) {
  var result = window.parseInt(intString, 10);
  return (result >= 0 ? result : null);
};


/**
 * Parses a floating point number.
 * @param {string} floatString The floating point number string.
 * @return {?number} The parsed floating point number, or null if the floating
 *     point number string could not be parsed.
 * @private
 */
shaka.dash.mpd.parseFloat_ = function(floatString) {
  var result = window.parseFloat(floatString);
  return (!isNaN(result) ? result : null);
};


/**
 * A misnomer.  Does no parsing, just returns the input string as-is.
 * @param {string} inputString The inputString.
 * @return {?string} The "parsed" string.  The type is specified as nullable
 *     only to fit into the parseAttr_() template, but null will never be
 *     returned.
 * @private
 */
shaka.dash.mpd.parseString_ = function(inputString) {
  return inputString;
};

