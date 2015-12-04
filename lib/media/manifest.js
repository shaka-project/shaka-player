/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.media.Manifest');
goog.provide('shaka.media.Period');
goog.provide('shaka.media.Stream');
goog.provide('shaka.media.StreamSet');

goog.require('shaka.media.SegmentReference');


/**
 * <p>
 * A Manifest object describes a collection of streams (segmented audio, video,
 * or text data) that share a common timeline. We call the collection of
 * streams "the presentation" and their timeline "the presentation timeline".
 * A Manifest describes one of two types of presentations: live and
 * video-on-demand.
 * </p>
 *
 * <p>
 * A live presentation begins at some point in time and either continues
 * indefinitely or ends when the presentation stops broadcasting. For a live
 * presentation, wall-clock time maps onto the presentation timeline, and the
 * current wall-clock time maps to the live-edge (AKA "the current presentation
 * time"). In contrast, a video-on-demand presentation exists entirely
 * independent of wall-clock time.
 * </p>
 *
 * <p>
 * The presentation timeline is divided into one or more Periods, and each of
 * these Periods contains its own collection of streams. Periods group their
 * streams by type (e.g., 'audio', 'video', or 'text') and logical content, and
 * each individual group defines a StreamSet.
 * </p>
 *
 * <p>
 * A stream has the same logical content as another stream if the only
 * difference between the two is their quality. For example, an SD video stream
 * and an HD video stream that depict the same scene have the same logical
 * content; whereas an English audio stream and a French audio stream have
 * different logical content. The player can automatically switch between
 * streams which have the same logical content to adapt to network conditions.
 * </p>
 *
 * A Manifest contains the following fields:
 * <ul>
 * <li>
 *   <b>presentationTimeline</b>: !shaka.media.PresentationTimeline
 *   (required) <br>
 *   The presentation timeline.
 *
 * <li>
 *   <b>periods</b>: Array.&lt!shaka.media.Period&gt (required) <br>
 *   The presentation's Periods. There must be at least one Period.
 * </ul>
 *
 * @typedef {{
 *   presentationTimeline: !shaka.media.PresentationTimeline,
 *   periods: !Array.<!shaka.media.Period>
 * }}
 * @exportDoc
 */
shaka.media.Manifest;


/**
 * <p>
 * A Period object contains the Streams for part of the presentation.
 * </p>
 *
 * A Period contains the following fields:
 * <ul>
 * <li>
 *   <b>startTime</b>: number (required) <br>
 *   The Period's start time, in seconds, relative to the start of the
 *   presentation. The first Period must begin at the start of the
 *   presentation. The Period ends immediately before the next Period's start
 *   time or exactly at the end of the presentation timeline. Periods which
 *   begin after the end of the presentation timeline are ignored.
 *   <br>
 *   Defaults to 0.
 *
 * <li>
 *   <b>streamSets</b>: Array.&lt!shaka.media.StreamSet&gt (required) <br>
 *   The Period's StreamSets. There must be at least one StreamSet.
 * </ul>
 *
 * @typedef {{
 *   startTime: number,
 *   streamSets: !Array.<shaka.media.StreamSet>
 * }}
 * @exportDoc
 */
shaka.media.Period;


/**
 * <p>
 * A StreamSet object contains a set of Streams which have the same type,
 * container/format, and logical content. A StreamSet's type and
 * container/format define its MIME type.
 * </p>
 *
 * A StreamSet contains the following fields:
 * <ul>
 * <li>
 *   <b>language</b>: string <br>
 *   The Streams' language, specified as a language code. <br>
 *   See {@link https://tools.ietf.org/html/rfc5646} <br>
 *   See {@link http://www.iso.org/iso/home/standards/language_codes.htm} <br>
 *   <br>
 *   Defaults to '' (i.e., unknown).
 *
 * <li>
 *   <b>type</b>: string (required) <br>
 *   The Streams' type, e.g., 'audio', 'video', or 'text'.
 *
 * <li>
 *   <b>primary</b>: boolean <br>
 *   True indicates that the player should use this StreamSet over others of
 *   the same type in the same Period. However, the player may use another
 *   StreamSet to meet application preferences, or to achieve better MIME type
 *   or DRM compatibility among other StreamSets. <br>
 *   <br>
 *   Defaults to false.
 *
 * <li>
 *   <b>streams</b>: Array.&lt!shaka.media.Stream&gt (required)
 *   The StreamSets's Streams. There must be at least one Stream.
 * </ul>
 *
 * @typedef {{
 *   language: string,
 *   type: string,
 *   primary: boolean,
 *   streams: !Array.<!shaka.media.Stream>
 * }}
 * @exportDoc
 */
shaka.media.StreamSet;


/**
 * Creates a SegmentIndex; returns a Promise that resolves after the
 * SegmentIndex has been created.
 *
 * @typedef {function(): !Promise}
 * @exportDoc
 */
shaka.media.CreateSegmentIndexFunction;


/**
 * Finds a SegmentReference for the given time, in seconds, relative to the
 * start of the presentation; returns null if no such SegmentReference exists.
 *
 * @typedef {function(number): shaka.media.SegmentReference}
 * @exportDoc
 */
shaka.media.FindSegmentReferenceFunction;


/**
 * <p>
 * A Stream object describes a single stream (segmented media data).
 * </p>
 *
 * A Stream contains the following fields.
 * <ul>
 * <li>
 *   <b>id</b>: number (required) <br>
 *   A unique ID among all Stream objects within the same Manifest.
 *
 * <li>
 *   <b>createSegmentIndex</b>:
 *   shaka.media.CreateSegmentIndexFunction (required) <br>
 *   Creates the Stream's SegmentIndex (asynchronously).
 *
 * <li>
 *   <b>findSegmentReference</b>:
 *   shaka.media.FindSegmentReferenceFunction (required) <br>
 *   Finds a SegmentReference for the given time. The caller must call
 *   createSegmentIndex() and wait until the returned Promise resolves before
 *   calling this function.
 *
 * <li>
 *   <b>initSegmentReference</b>: shaka.media.SegmentReference <br>
 *   The Stream's initialization segment metadata. null if the Stream is self
 *   initializing. The SegmentReference's startTime and endTime are irrelevant.
 *
 * <li>
 *   <b>presentationTimeOffset</b>: number <br>
 *   The amount of time, in seconds, that the stream's presentation timestamps
 *   are offset from the start of the Stream's Period, i.e., this value should
 *   equal the first presentation timestamp of the first frame/sample in the
 *   stream. <br>
 *   <br>
 *   For example, for MP4 based streams, this value should equal the first
 *   segment's tfdt box's 'baseMediaDecodeTime' field (after it has been
 *   converted to seconds). <br>
 *   <br>
 *   Defaults to 0.
 *
 * <li>
 *   <b>mimeType</b>: string (required) <br>
 *   The Stream's MIME type, e.g., 'audio/mp4', 'video/webm', or 'text/vtt'.
 *
 * <li>
 *   <b>codecs</b>: string <br>
 *   The Stream's codecs, e.g., 'avc1.4d4015' or 'vp9', which must be
 *   compatible with the Stream's MIME type. <br>
 *   See {@link https://tools.ietf.org/html/rfc6381} <br>
 *   <br>
 *   Defaults to '' (i.e., unknown / not required).
 *
 * <li>
 *   <b>bandwidth</b>: number <i>audio and video</i> <br>
 *   The stream's required bandwidth in bits per second.
 *
 * <li>
 *   <b>width</b>: number <i>video only</i> <br>
 *   The stream's width in pixels.
 *
 * <li>
 *   <b>height</b>: number <i>video only</i> <br>
 *   The stream's height in pixels.
 *
 * <li>
 *   <b>kind</b>: string <i>text only</i> <br>
 *   The kind of text stream.  For example, 'captions' or 'subtitles'.
 *   @see https://goo.gl/k1HWA6
 *
 * <li>
 *   <b>keyIds</b>: Array.&lt;string&gt; <br>
 *   The stream's key IDs as hex strings. These key IDs identify the encryption
 *   keys that the browser (key system) can use to decrypt the stream. <br>
 *   <br>
 *   Defaults to [] (i.e., unencrypted / unknown).
 * </ul>
 *
 * @typedef {{
 *   id: number,
 *   createSegmentIndex: shaka.media.CreateSegmentIndexFunction,
 *   findSegmentReference: shaka.media.FindSegmentReferenceFunction,
 *   initSegmentReference: shaka.media.SegmentReference,
 *   presentationTimeOffset: (number|undefined),
 *   mimeType: string,
 *   codecs: string,
 *   bandwidth: (number|undefined),
 *   width: (number|undefined),
 *   height: (number|undefined),
 *   kind: (string|undefined),
 *   keyIds: !Array.<string>
 * }}
 * @exportDoc
 */
shaka.media.Stream;

