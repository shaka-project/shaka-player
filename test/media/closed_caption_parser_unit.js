/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ClosedCaptionParser', () => {
  it('can handle empty caption packets', async () => {
    const initSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_init.mp4');
    const videoSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_segment.mp4');
    const streamMimeType = 'video/mp4';
    const captionMimeType = shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
    const parser =
        new shaka.media.ClosedCaptionParser(streamMimeType, captionMimeType);
    parser.init(initSegment);
    parser.parseFrom(videoSegment);
  });
});
