/*! @license
 * Copyright 2006 The Closure Library Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Class for parsing and formatting URIs.
 *
 * Use new goog.Uri(string) to parse a URI string.
 *
 * e.g: <code>var myUri = new goog.Uri(window.location);</code>
 *
 * Implements RFC 3986 for parsing/formatting URIs.
 * http://www.ietf.org/rfc/rfc3986.txt
 *
 * Some changes have been made to the interface (more like .NETs), though the
 * internal representation is now of un-encoded parts, this will change the
 * behavior slightly.
 *
 */

goog.provide('goog.Uri');
goog.provide('goog.Uri.QueryData');

goog.require('goog.uri.utils');
goog.require('goog.uri.utils.ComponentIndex');



/**
 * This class contains setters and getters for the parts of the URI.
 * The <code>getXyz</code>/<code>setXyz</code> methods return the decoded part
 * -- so<code>new goog.Uri('/foo%20bar').getPath()</code> will return the
 * decoded path, <code>/foo bar</code>.
 *
 * Reserved characters (see RFC 3986 section 2.2) can be present in
 * their percent-encoded form in scheme, domain, and path URI components and
 * will not be auto-decoded. For example:
 * <code>new goog.Uri('rel%61tive/path%2fto/resource').getPath()</code> will
 * return <code>relative/path%2fto/resource</code>.
 *
 * The constructor accepts an optional unparsed, raw URI string.  The parser
 * is relaxed, so special characters that aren't escaped but don't cause
 * ambiguities will not cause parse failures.
 *
 * All setters return <code>this</code> and so may be chained, a la
 * <code>new goog.Uri('/foo').setFragment('part').toString()</code>.
 *
 * @param {*=} uri Optional string URI to parse, or if a goog.Uri is
 *        passed, a clone is created.
 *
 * @constructor
 */
goog.Uri = function(uri) {
  // Parse in the uri string
  var m;
  if (uri instanceof goog.Uri) {
    this.setScheme(uri.getScheme());
    this.setUserInfo(uri.getUserInfo());
    this.setDomain(uri.getDomain());
    this.setPort(uri.getPort());
    this.setPath(uri.getPath());
    this.setQueryData(uri.getQueryData().clone());
    this.setFragment(uri.getFragment());
  } else if (uri && (m = goog.uri.utils.split(String(uri)))) {
    // Set the parts -- decoding as we do so.
    // COMPATABILITY NOTE - In IE, unmatched fields may be empty strings,
    // whereas in other browsers they will be undefined.
    this.setScheme(m[goog.uri.utils.ComponentIndex.SCHEME] || '', true);
    this.setUserInfo(m[goog.uri.utils.ComponentIndex.USER_INFO] || '', true);
    this.setDomain(m[goog.uri.utils.ComponentIndex.DOMAIN] || '', true);
    this.setPort(m[goog.uri.utils.ComponentIndex.PORT]);
    this.setPath(m[goog.uri.utils.ComponentIndex.PATH] || '', true);
    this.setQueryData(m[goog.uri.utils.ComponentIndex.QUERY_DATA] || '', true);
    this.setFragment(m[goog.uri.utils.ComponentIndex.FRAGMENT] || '', true);
  } else {
    this.queryData_ = new goog.Uri.QueryData(null, null);
  }
};


/**
 * Scheme such as "http".
 * @type {string}
 * @private
 */
goog.Uri.prototype.scheme_ = '';


/**
 * User credentials in the form "username:password".
 * @type {string}
 * @private
 */
goog.Uri.prototype.userInfo_ = '';


/**
 * Domain part, e.g. "www.google.com".
 * @type {string}
 * @private
 */
goog.Uri.prototype.domain_ = '';


/**
 * Port, e.g. 8080.
 * @type {?number}
 * @private
 */
goog.Uri.prototype.port_ = null;


/**
 * Path, e.g. "/tests/img.png".
 * @type {string}
 * @private
 */
goog.Uri.prototype.path_ = '';


/**
 * Object representing query data.
 * @type {!goog.Uri.QueryData}
 * @private
 */
goog.Uri.prototype.queryData_;


/**
 * The fragment without the #.
 * @type {string}
 * @private
 */
goog.Uri.prototype.fragment_ = '';


/**
 * @return {string} The string form of the url.
 * @override
 */
goog.Uri.prototype.toString = function() {
  var out = [];

  var scheme = this.getScheme();
  if (scheme) {
    out.push(goog.Uri.encodeSpecialChars_(
        scheme, goog.Uri.reDisallowedInSchemeOrUserInfo_, true), ':');
  }

  var domain = this.getDomain();
  if (domain) {
    out.push('//');

    var userInfo = this.getUserInfo();
    if (userInfo) {
      out.push(goog.Uri.encodeSpecialChars_(
          userInfo, goog.Uri.reDisallowedInSchemeOrUserInfo_, true), '@');
    }

    out.push(goog.Uri.removeDoubleEncoding_(encodeURIComponent(domain)));

    var port = this.getPort();
    if (port != null) {
      out.push(':', String(port));
    }
  }

  var path = this.getPath();
  if (path) {
    if (this.hasDomain() && path.charAt(0) != '/') {
      out.push('/');
    }
    out.push(goog.Uri.encodeSpecialChars_(
        path,
        path.charAt(0) == '/' ?
            goog.Uri.reDisallowedInAbsolutePath_ :
            goog.Uri.reDisallowedInRelativePath_,
        true));
  }

  var query = this.getEncodedQuery();
  if (query) {
    out.push('?', query);
  }

  var fragment = this.getFragment();
  if (fragment) {
    out.push('#', goog.Uri.encodeSpecialChars_(
        fragment, goog.Uri.reDisallowedInFragment_));
  }
  return out.join('');
};


/**
 * Resolves the given relative URI (a goog.Uri object), using the URI
 * represented by this instance as the base URI.
 *
 * There are several kinds of relative URIs:<br>
 * 1. foo - replaces the last part of the path, the whole query and fragment<br>
 * 2. /foo - replaces the the path, the query and fragment<br>
 * 3. //foo - replaces everything from the domain on.  foo is a domain name<br>
 * 4. ?foo - replace the query and fragment<br>
 * 5. #foo - replace the fragment only
 *
 * Additionally, if relative URI has a non-empty path, all ".." and "."
 * segments will be resolved, as described in RFC 3986.
 *
 * @param {goog.Uri} relativeUri The relative URI to resolve.
 * @return {!goog.Uri} The resolved URI.
 */
goog.Uri.prototype.resolve = function(relativeUri) {

  var absoluteUri = this.clone();
  if (absoluteUri.scheme_ === 'data') {
    // Cannot have a relative URI to a data URI.
    absoluteUri = new goog.Uri();
  }

  // we satisfy these conditions by looking for the first part of relativeUri
  // that is not blank and applying defaults to the rest

  var overridden = relativeUri.hasScheme();

  if (overridden) {
    absoluteUri.setScheme(relativeUri.getScheme());
  } else {
    overridden = relativeUri.hasUserInfo();
  }

  if (overridden) {
    absoluteUri.setUserInfo(relativeUri.getUserInfo());
  } else {
    overridden = relativeUri.hasDomain();
  }

  if (overridden) {
    absoluteUri.setDomain(relativeUri.getDomain());
  } else {
    overridden = relativeUri.hasPort();
  }

  var path = relativeUri.getPath();
  if (overridden) {
    absoluteUri.setPort(relativeUri.getPort());
  } else {
    overridden = relativeUri.hasPath();
    if (overridden) {
      // resolve path properly
      if (path.charAt(0) != '/') {
        // path is relative
        if (this.hasDomain() && !this.hasPath()) {
          // RFC 3986, section 5.2.3, case 1
          path = '/' + path;
        } else {
          // RFC 3986, section 5.2.3, case 2
          var lastSlashIndex = absoluteUri.getPath().lastIndexOf('/');
          if (lastSlashIndex != -1) {
            path = absoluteUri.getPath().substr(0, lastSlashIndex + 1) + path;
          }
        }
      }
      path = goog.Uri.removeDotSegments(path);
    }
  }

  if (overridden) {
    absoluteUri.setPath(path);
  } else {
    overridden = relativeUri.hasQuery();
  }

  if (overridden) {
    absoluteUri.setQueryData(relativeUri.getQueryData().clone());
  } else {
    overridden = relativeUri.hasFragment();
  }

  if (overridden) {
    absoluteUri.setFragment(relativeUri.getFragment());
  }

  return absoluteUri;
};


/**
 * Clones the URI instance.
 * @return {!goog.Uri} New instance of the URI object.
 */
goog.Uri.prototype.clone = function() {
  return new goog.Uri(this);
};


/**
 * @return {string} The encoded scheme/protocol for the URI.
 */
goog.Uri.prototype.getScheme = function() {
  return this.scheme_;
};


/**
 * Sets the scheme/protocol.
 * @param {string} newScheme New scheme value.
 * @param {boolean=} decode Optional param for whether to decode new value.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setScheme = function(newScheme, decode) {
  this.scheme_ = decode ? goog.Uri.decodeOrEmpty_(newScheme, true) :
      newScheme;

  // remove an : at the end of the scheme so somebody can pass in
  // window.location.protocol
  if (this.scheme_) {
    this.scheme_ = this.scheme_.replace(/:$/, '');
  }
  return this;
};


/**
 * @return {boolean} Whether the scheme has been set.
 */
goog.Uri.prototype.hasScheme = function() {
  return !!this.scheme_;
};


/**
 * @return {string} The decoded user info.
 */
goog.Uri.prototype.getUserInfo = function() {
  return this.userInfo_;
};


/**
 * Sets the userInfo.
 * @param {string} newUserInfo New userInfo value.
 * @param {boolean=} decode Optional param for whether to decode new value.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setUserInfo = function(newUserInfo, decode) {
  this.userInfo_ = decode ? goog.Uri.decodeOrEmpty_(newUserInfo) :
                   newUserInfo;
  return this;
};


/**
 * @return {boolean} Whether the user info has been set.
 */
goog.Uri.prototype.hasUserInfo = function() {
  return !!this.userInfo_;
};


/**
 * @return {string} The decoded domain.
 */
goog.Uri.prototype.getDomain = function() {
  return this.domain_;
};


/**
 * Sets the domain.
 * @param {string} newDomain New domain value.
 * @param {boolean=} decode Optional param for whether to decode new value.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setDomain = function(newDomain, decode) {
  this.domain_ = decode ? goog.Uri.decodeOrEmpty_(newDomain, true) :
      newDomain;
  return this;
};


/**
 * @return {boolean} Whether the domain has been set.
 */
goog.Uri.prototype.hasDomain = function() {
  return !!this.domain_;
};


/**
 * @return {?number} The port number.
 */
goog.Uri.prototype.getPort = function() {
  return this.port_;
};


/**
 * Sets the port number.
 * @param {*} newPort Port number. Will be explicitly casted to a number.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setPort = function(newPort) {
  if (newPort) {
    newPort = Number(newPort);
    if (isNaN(newPort) || newPort < 0) {
      throw Error('Bad port number ' + newPort);
    }
    this.port_ = newPort;
  } else {
    this.port_ = null;
  }

  return this;
};


/**
 * @return {boolean} Whether the port has been set.
 */
goog.Uri.prototype.hasPort = function() {
  return this.port_ != null;
};


/**
  * @return {string} The decoded path.
 */
goog.Uri.prototype.getPath = function() {
  return this.path_;
};


/**
 * Sets the path.
 * @param {string} newPath New path value.
 * @param {boolean=} decode Optional param for whether to decode new value.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setPath = function(newPath, decode) {
  this.path_ = decode ? goog.Uri.decodeOrEmpty_(newPath, true) : newPath;
  return this;
};


/**
 * @return {boolean} Whether the path has been set.
 */
goog.Uri.prototype.hasPath = function() {
  return !!this.path_;
};


/**
 * @return {boolean} Whether the query string has been set.
 */
goog.Uri.prototype.hasQuery = function() {
  return this.queryData_.toString() !== '';
};


/**
 * Sets the query data.
 * @param {goog.Uri.QueryData|string|undefined} queryData QueryData object.
 * @param {boolean=} decode Optional param for whether to decode new value.
 *     Applies only if queryData is a string.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setQueryData = function(queryData, decode) {
  if (queryData instanceof goog.Uri.QueryData) {
    this.queryData_ = queryData;
  } else {
    if (!decode) {
      // QueryData accepts encoded query string, so encode it if
      // decode flag is not true.
      queryData = goog.Uri.encodeSpecialChars_(queryData,
                                               goog.Uri.reDisallowedInQuery_);
    }
    this.queryData_ = new goog.Uri.QueryData(queryData, null);
  }

  return this;
};


/**
 * @return {string} The encoded URI query, not including the ?.
 */
goog.Uri.prototype.getEncodedQuery = function() {
  return this.queryData_.toString();
};


/**
 * @return {string} The decoded URI query, not including the ?.
 */
goog.Uri.prototype.getDecodedQuery = function() {
  return this.queryData_.toDecodedString();
};


/**
 * Returns the query data.
 * @return {!goog.Uri.QueryData} QueryData object.
 */
goog.Uri.prototype.getQueryData = function() {
  return this.queryData_;
};


/**
 * @return {string} The URI fragment, not including the #.
 */
goog.Uri.prototype.getFragment = function() {
  return this.fragment_;
};


/**
 * Sets the URI fragment.
 * @param {string} newFragment New fragment value.
 * @param {boolean=} decode Optional param for whether to decode new value.
 * @return {!goog.Uri} Reference to this URI object.
 */
goog.Uri.prototype.setFragment = function(newFragment, decode) {
  this.fragment_ = decode ? goog.Uri.decodeOrEmpty_(newFragment) :
                   newFragment;
  return this;
};


/**
 * @return {boolean} Whether the URI has a fragment set.
 */
goog.Uri.prototype.hasFragment = function() {
  return !!this.fragment_;
};


//==============================================================================
// Static members
//==============================================================================


/**
 * Removes dot segments in given path component, as described in
 * RFC 3986, section 5.2.4.
 *
 * @param {string} path A non-empty path component.
 * @return {string} Path component with removed dot segments.
 */
goog.Uri.removeDotSegments = function(path) {
  if (path == '..' || path == '.') {
    return '';

  } else if (path.indexOf('./') == -1 &&
             path.indexOf('/.') == -1) {
    // This optimization detects uris which do not contain dot-segments,
    // and as a consequence do not require any processing.
    return path;

  } else {
    var leadingSlash = (path.lastIndexOf('/', 0) == 0);
    var segments = path.split('/');
    var out = [];

    for (var pos = 0; pos < segments.length; ) {
      var segment = segments[pos++];

      if (segment == '.') {
        if (leadingSlash && pos == segments.length) {
          out.push('');
        }
      } else if (segment == '..') {
        if (out.length > 1 || out.length == 1 && out[0] != '') {
          out.pop();
        }
        if (leadingSlash && pos == segments.length) {
          out.push('');
        }
      } else {
        out.push(segment);
        leadingSlash = true;
      }
    }

    return out.join('/');
  }
};


/**
 * Decodes a value or returns the empty string if it isn't defined or empty.
 * @param {string|undefined} val Value to decode.
 * @param {boolean=} preserveReserved If true, restricted characters will
 *     not be decoded.
 * @return {string} Decoded value.
 * @private
 */
goog.Uri.decodeOrEmpty_ = function(val, preserveReserved) {
  // Don't use UrlDecode() here because val is not a query parameter.
  if (!val) {
    return '';
  }

  return preserveReserved ? decodeURI(val) : decodeURIComponent(val);
};


/**
 * If unescapedPart is non null, then escapes any characters in it that aren't
 * valid characters in a url and also escapes any special characters that
 * appear in extra.
 *
 * @param {*} unescapedPart The string to encode.
 * @param {RegExp} extra A character set of characters in [\01-\177].
 * @param {boolean=} removeDoubleEncoding If true, remove double percent
 *     encoding.
 * @return {?string} null iff unescapedPart == null.
 * @private
 */
goog.Uri.encodeSpecialChars_ = function(unescapedPart, extra,
    removeDoubleEncoding) {
  if (goog.isString(unescapedPart)) {
    var encoded = encodeURI(unescapedPart).
        replace(extra, goog.Uri.encodeChar_);
    if (removeDoubleEncoding) {
      // encodeURI double-escapes %XX sequences used to represent restricted
      // characters in some URI components, remove the double escaping here.
      encoded = goog.Uri.removeDoubleEncoding_(encoded);
    }
    return encoded;
  }
  return null;
};


/**
 * Converts a character in [\01-\177] to its unicode character equivalent.
 * @param {string} ch One character string.
 * @return {string} Encoded string.
 * @private
 */
goog.Uri.encodeChar_ = function(ch) {
  var n = ch.charCodeAt(0);
  return '%' + ((n >> 4) & 0xf).toString(16) + (n & 0xf).toString(16);
};


/**
 * Removes double percent-encoding from a string.
 * @param  {string} doubleEncodedString String
 * @return {string} String with double encoding removed.
 * @private
 */
goog.Uri.removeDoubleEncoding_ = function(doubleEncodedString) {
  return doubleEncodedString.replace(/%25([0-9a-fA-F]{2})/g, '%$1');
};


/**
 * Regular expression for characters that are disallowed in the scheme or
 * userInfo part of the URI.
 * @type {RegExp}
 * @private
 */
goog.Uri.reDisallowedInSchemeOrUserInfo_ = /[#\/\?@]/g;


/**
 * Regular expression for characters that are disallowed in a relative path.
 * Colon is included due to RFC 3986 3.3.
 * @type {RegExp}
 * @private
 */
goog.Uri.reDisallowedInRelativePath_ = /[\#\?:]/g;


/**
 * Regular expression for characters that are disallowed in an absolute path.
 * @type {RegExp}
 * @private
 */
goog.Uri.reDisallowedInAbsolutePath_ = /[\#\?]/g;


/**
 * Regular expression for characters that are disallowed in the query.
 * @type {RegExp}
 * @private
 */
goog.Uri.reDisallowedInQuery_ = /[\#\?@]/g;


/**
 * Regular expression for characters that are disallowed in the fragment.
 * @type {RegExp}
 * @private
 */
goog.Uri.reDisallowedInFragment_ = /#/g;



/**
 * Class used to represent URI query parameters.  It is essentially a hash of
 * name-value pairs, though a name can be present more than once.
 *
 * Has the same interface as the collections in goog.structs.
 *
 * @param {?string=} query Optional encoded query string to parse into
 *     the object.
 * @param {goog.Uri=} uri Optional uri object that should have its
 *     cache invalidated when this object updates. Deprecated -- this
 *     is no longer required.
 * @constructor
 * @final
 */
goog.Uri.QueryData = function(query, uri) {
  /**
   * Encoded query string, or null if it requires computing from the key map.
   * @type {?string}
   * @private
   */
  this.encodedQuery_ = query || null;
};


/**
 * If the underlying key map is not yet initialized, it parses the
 * query string and fills the map with parsed data.
 * @private
 */
goog.Uri.QueryData.prototype.ensureKeyMapInitialized_ = function() {
  if (!this.keyMap_) {
    this.keyMap_ = {};
    this.count_ = 0;

    if (this.encodedQuery_) {
      var pairs = this.encodedQuery_.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var indexOfEquals = pairs[i].indexOf('=');
        var name = null;
        var value = null;
        if (indexOfEquals >= 0) {
          name = pairs[i].substring(0, indexOfEquals);
          value = pairs[i].substring(indexOfEquals + 1);
        } else {
          name = pairs[i];
        }
        name = decodeURIComponent(name.replace(/\+/g, ' '));
        value = value || '';
        this.add(name, decodeURIComponent(value.replace(/\+/g, ' ')));
      }
    }
  }
};


/**
 * The map containing name/value or name/array-of-values pairs.
 * May be null if it requires parsing from the query string.
 *
 * We need to use a Map because we cannot guarantee that the key names will
 * not be problematic for IE.
 *
 * @type {Object.<string, !Array.<string>>}
 * @private
 */
goog.Uri.QueryData.prototype.keyMap_ = null;


/**
 * The number of params, or null if it requires computing.
 * @type {?number}
 * @private
 */
goog.Uri.QueryData.prototype.count_ = null;


/**
 * @return {?number} The number of parameters.
 */
goog.Uri.QueryData.prototype.getCount = function() {
  this.ensureKeyMapInitialized_();
  return this.count_;
};


/**
 * Adds a key value pair.
 * @param {string} key Name.
 * @param {*} value Value.
 * @return {!goog.Uri.QueryData} Instance of this object.
 */
goog.Uri.QueryData.prototype.add = function(key, value) {
  this.ensureKeyMapInitialized_();
  // Invalidate the cache.
  this.encodedQuery_ = null;

  var values = this.keyMap_.hasOwnProperty(key) && this.keyMap_[key];
  if (!values) {
    this.keyMap_[key] = (values = []);
  }
  values.push(value);
  this.count_++;
  return this;
};


/**
 * @return {string} Encoded query string.
 * @override
 */
goog.Uri.QueryData.prototype.toString = function() {
  if (this.encodedQuery_) {
    return this.encodedQuery_;
  }

  if (!this.keyMap_) {
    return '';
  }

  var sb = [];

  for (var key in this.keyMap_) {
    var encodedKey = encodeURIComponent(key);
    var val = this.keyMap_[key];
    for (var j = 0; j < val.length; j++) {
      var param = encodedKey;
      // Ensure that null and undefined are encoded into the url as
      // literal strings.
      if (val[j] !== '') {
        param += '=' + encodeURIComponent(val[j]);
      }
      sb.push(param);
    }
  }

  return this.encodedQuery_ = sb.join('&');
};


/**
 * @return {string} Decoded query string.
 */
goog.Uri.QueryData.prototype.toDecodedString = function() {
  return goog.Uri.decodeOrEmpty_(this.toString());
};


/**
 * Clone the query data instance.
 * @return {!goog.Uri.QueryData} New instance of the QueryData object.
 */
goog.Uri.QueryData.prototype.clone = function() {
  var rv = new goog.Uri.QueryData();
  rv.encodedQuery_ = this.encodedQuery_;
  if (this.keyMap_) {
    var cloneMap = {};
    for (var key in this.keyMap_) {
      cloneMap[key] = this.keyMap_[key].concat();
    }
    rv.keyMap_ = cloneMap;
    rv.count_ = this.count_;
  }
  return rv;
};
