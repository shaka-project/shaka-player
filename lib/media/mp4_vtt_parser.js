/**
 * @license
 * Copyright 2016 Google Inc.
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
 */

goog.provide('shaka.media.Mp4VttParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.TextEngine');
goog.require('shaka.media.VttTextParser');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @namespace
 * @summary Extracts a VTT segment from an MP4 file and maps it to cue objects.
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 * @export
 */
shaka.media.Mp4VttParser =
    function(data, offset, segmentStartTime,
             segmentEndTime, useRelativeCueTimestamps) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var trunDurations = shaka.media.Mp4VttParser.parseTrun_(reader);

  var boxSize = shaka.util.Mp4Parser.findBox(
      shaka.util.Mp4Parser.BOX_TYPE_MDAT, reader);
  if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // mdat box found, parse the content
    // valid media segment should have start and end time
    goog.asserts.assert(
        segmentStartTime != null, 'start time should not be null');
    goog.asserts.assert(segmentEndTime != null, 'end time should not be null');
    if (trunDurations.length != 0) {
      return shaka.media.Mp4VttParser.parseDataWithTrunDurations_(
          reader.readBytes(boxSize - 8).buffer, offset, segmentStartTime,
          shaka.media.Mp4VttParser.movie_timescale,
          shaka.media.Mp4VttParser.media_timescale,
          trunDurations);
    }
    else {
      return shaka.media.Mp4VttParser.parseData_(
          reader.readBytes(boxSize - 8).buffer, offset,
          segmentStartTime, segmentEndTime);
    }
  }
  var wvttBoxSize = shaka.util.Mp4Parser.findSampleDescriptionBox(
      data, shaka.media.Mp4VttParser.BOX_TYPE_WVTT);
  if (wvttBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // a valid vtt init segment, no actual subtitles yet

    shaka.media.Mp4VttParser.movie_timescale = 1;
    shaka.media.Mp4VttParser.media_timescale = 1;
    //grab movie timescale from moov->mvhd
    var mvhdReader = new shaka.util.DataViewReader(
        new DataView(data),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    var moovBoxSize = shaka.util.Mp4Parser.findBox(
        shaka.util.Mp4Parser.BOX_TYPE_MOOV, mvhdReader);
    if (moovBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      var mvhdBoxSize = shaka.util.Mp4Parser.findBox(
          shaka.util.Mp4Parser.BOX_TYPE_MVHD, mvhdReader);
      if (mvhdBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
        var version = mvhdReader.readUint8();
        mvhdReader.skip(3); //skip flags
        if (version == 1)
          mvhdReader.skip(16);
        else //assume 0
          mvhdReader.skip(8);

        shaka.media.Mp4VttParser.movie_timescale = mvhdReader.readUint32();
      }
    }

    //grab media timescale from moov->trak->mdia->mdhd
    var mdhdReader = new shaka.util.DataViewReader(
        new DataView(data),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    moovBoxSize = shaka.util.Mp4Parser.findBox(
        shaka.util.Mp4Parser.BOX_TYPE_MOOV, mdhdReader);
    if (moovBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      var trakBoxSize = shaka.util.Mp4Parser.findBox(
          shaka.util.Mp4Parser.BOX_TYPE_TRAK, mdhdReader);
      if (trakBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
        var mdiaBoxSize = shaka.util.Mp4Parser.findBox(
            shaka.util.Mp4Parser.BOX_TYPE_MDIA, mdhdReader);
        if (mdiaBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
          var mdhdBoxSize = shaka.util.Mp4Parser.findBox(
              shaka.util.Mp4Parser.BOX_TYPE_MDHD, mdhdReader);
          if (mdhdBoxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
            var version = mdhdReader.readUint8();
            mdhdReader.skip(3); //skip flags
            if (version == 1)
              mdhdReader.skip(16);
            else //assume 0
              mdhdReader.skip(8);
            shaka.media.Mp4VttParser.media_timescale = mdhdReader.readUint32();
          }
        }
      }
    }

    return [];
  } else {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }
};


/**
 * parses the trun table of the segment and returns durations
 *
 * @param {!shaka.util.DataViewReader} reader
 * @return {!Array.<!Object>}
 * @private
 */
shaka.media.Mp4VttParser.parseTrun_ = function(reader) {
  var trunDurations = [];
  var boxSize = shaka.util.Mp4Parser.findBox(
      shaka.util.Mp4Parser.BOX_TYPE_MOOF, reader);
  if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
    // trun box found, parse the content
    boxSize = shaka.util.Mp4Parser.findBox(
        shaka.util.Mp4Parser.BOX_TYPE_TRAF, reader);
    if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      boxSize = shaka.util.Mp4Parser.findBox(
          shaka.util.Mp4Parser.BOX_TYPE_TRUN, reader);
      if (boxSize != shaka.util.Mp4Parser.BOX_NOT_FOUND) {
        var version = reader.readUint8();
        var tmp = new Uint8Array(4);
        tmp[0] = 0;
        tmp[1] = reader.readUint8();
        tmp[2] = reader.readUint8();
        tmp[3] = reader.readUint8();
        var sample_flags = new DataView(tmp.buffer).getUint32(0);

        var data_offset_present = sample_flags & 0x00000001;
        var first_sample_flags_present = sample_flags & 0x00000004;
        var sample_entry_durations_present = sample_flags & 0x000100;
        var sample_entry_sizes_present = sample_flags & 0x000200;
        var sample_entry_flags_present = sample_flags & 0x000400;
        var sample_entry_comp_time_present = sample_flags & 0x000800;

        var sample_count = reader.readUint32();
        if (data_offset_present) {
          reader.skip(4); //skip unused field 'data_offset'
        }
        if (first_sample_flags_present) {
          reader.skip(4); //skip unused field 'first_sample_flags'
        }

        for (var i = 0; i < sample_count; i++)
        {
          var entry = {};
          if (sample_entry_durations_present) {
            entry.sample_duration = reader.readUint32();
          }
          if (sample_entry_sizes_present) {
            entry.sample_size = reader.readUint32();
          }
          if (sample_entry_flags_present) {
            entry.sample_flags = reader.readUint32();
          }
          if (sample_entry_comp_time_present) {
            var scto = reader.readUint32();
            if (version == 0) {
              entry.sample_composition_time_offset = scto;
            }
            if (version == 1) {
              var dv = new DataView(new Uint32Array([scto]).buffer, 0);
              entry.sample_composition_time_offset = dv.getInt32(0);
            }
            else if (version != 0) {
              shaka.log.warning('unexpected trun version: ', version,
                  ' defaulting to unsigned int for composition offsets');
              entry.sample_composition_time_offset = scto;
            }
          }
          trunDurations.push(entry);
        }
      }
    }
  }
  return trunDurations;
};


/**
 * Parses the content of the mdat MP4 box into cue objects.
 *
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {number} segmentStartTime
 * @param {number} segmentEndTime
 * @return {!Array.<!TextTrackCue>}
 * @private
 */
shaka.media.Mp4VttParser.parseData_ = function(
    data, offset, segmentStartTime, segmentEndTime) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  segmentStartTime += offset;
  segmentEndTime += offset;

  var result = [];
  // Cues are represented as vttc boxes. Each box corresponds to a cue.
  while (reader.hasMoreData()) {
    var boxSize = shaka.util.Mp4Parser.findBox(
        shaka.media.Mp4VttParser.BOX_TYPE_VTTC, reader);
    if (boxSize == shaka.util.Mp4Parser.BOX_NOT_FOUND) {
      // No more cues
      break;
    }
    var cue = shaka.media.Mp4VttParser.parseCue_(
        reader.readBytes(boxSize - 8).buffer,
        segmentStartTime, segmentEndTime);
    if (cue)
      result.push(cue);
  }

  return result;
};


/**
 * Parses the content of the mdat MP4 box into cue objects.
 *
 * @param {ArrayBuffer} data
 * @param {number} offset
 * @param {number} segmentStartTime
 * @param {number} movieTimeScale
 * @param {number} mediaTimeScale
 * @param {Array} trunDurations
 * @return {!Array.<!TextTrackCue>}
 * @private
 */
shaka.media.Mp4VttParser.parseDataWithTrunDurations_ = function(
    data, offset, segmentStartTime, movieTimeScale,
    mediaTimeScale, trunDurations) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var result = [];
  // Cues are represented as vttc boxes. Each box corresponds to a cue.
  var idx = 0;
  var emptyCuePadding = 0;
  var mdhdToMvhd = mediaTimeScale / movieTimeScale;
  while (reader.hasMoreData()) {
    var size = reader.readUint32();
    var type = reader.readUint32();
    var lastCueEndTime = segmentStartTime;
    switch (type) {
      case shaka.media.Mp4VttParser.BOX_TYPE_VTTC:
        var thisCueDuration = trunDurations[idx].sample_duration / mdhdToMvhd;
        var thisCueStartTime = lastCueEndTime + emptyCuePadding;
        var thisCueEndTime = lastCueEndTime + thisCueDuration;
        var cue = shaka.media.Mp4VttParser.parseCue_(
            reader.readBytes(size - 8).buffer,
            thisCueStartTime, thisCueEndTime);
        if (cue)
          result.push(cue);
        lastCueEndTime = thisCueEndTime;
        emptyCuePadding = 0;
        break;
      /*we may run into empty cues which span time periods
        where no subtitles are present (ISO 14496-30, 7.6) */
      case shaka.media.Mp4VttParser.BOX_TYPE_VTTE:
        emptyCuePadding += (trunDurations[idx].sample_duration / mdhdToMvhd);
        reader.skip(size - 8);
        break;
      default:
        //no more cues
        break;
    }
    idx += 1;
  }

  return result;
};


/**
 * Parses a vttc box into a cue.
 *
 * @param {ArrayBuffer} data
 * @param {number} segmentStartTime
 * @param {number} segmentEndTime
 * @return {TextTrackCue}
 * @private
 */
shaka.media.Mp4VttParser.parseCue_ = function(
    data, segmentStartTime, segmentEndTime) {
  var reader = new shaka.util.DataViewReader(
      new DataView(data),
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  var payload;
  var settings;
  var id;

  while (reader.hasMoreData()) {
    var startPosition = reader.getPosition();
    var size = reader.readUint32();
    var type = reader.readUint32();
    var content = shaka.util.StringUtils.fromUTF8(
        reader.readBytes(size - 8).buffer);
    if (size == 1) {
      size = reader.readUint64();
    } else if (size == 0) {
      size = reader.getLength() - startPosition;
    }

    switch (type) {
      case shaka.media.Mp4VttParser.BOX_TYPE_PAYL:
        payload = content;
        break;
      case shaka.media.Mp4VttParser.BOX_TYPE_IDEN:
        id = content;
        break;
      case shaka.media.Mp4VttParser.BOX_TYPE_STTG:
        settings = content;
        break;
      default:
        break;
    }
  }
  // payload box is mandatory
  if (!payload) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_VTT);
  }

  var cue = shaka.media.TextEngine.makeCue(
      segmentStartTime, segmentEndTime, payload);
  if (!cue)
    return null;

  if (id)
    cue.id = id;
  if (settings) {
    var parser = new shaka.util.TextParser(settings);
    var word = parser.readWord();
    while (word) {
      if (!shaka.media.VttTextParser.parseSetting(cue, word)) {
        shaka.log.warning('VTT parser encountered an invalid VTT setting: ',
                          word,
                          ' The setting will be ignored.');
      }
      parser.skipWhitespace();
      word = parser.readWord();
    }
  }

  return cue;
};


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_WVTT = 0x77767474;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_VTTC = 0x76747463;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_PAYL = 0x7061796C;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_IDEN = 0x6964656F;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_STTG = 0x73747467;


/** @const {number} */
shaka.media.Mp4VttParser.BOX_TYPE_VTTE = 0x76747465;

shaka.media.TextEngine.registerParser(
    'application/mp4; codecs="wvtt"', shaka.media.Mp4VttParser);
