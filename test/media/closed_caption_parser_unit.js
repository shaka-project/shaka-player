goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.test.Util');

describe('ClosedCaptionParser', () => {
  it('can handle empty caption packets', async () => {
    const initSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_init.mp4');
    const videoSegment = await shaka.test.Util.fetch(
        'base/test/test/assets/empty_caption_video_segment.mp4');
    const parser = new shaka.media.ClosedCaptionParser();
    parser.init(initSegment);
    parser.parseFrom(videoSegment);
  });
});

