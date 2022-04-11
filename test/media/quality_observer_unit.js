/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('QualityObserver', () => {
  /** @type {!shaka.media.QualityObserver} */
  let observer;

  /** @type {!jasmine.Spy} */
  let onQualityChange;

  const createQualityInfo = (contentType, bandwidth) => {
    return {
      bandwidth: bandwidth,
      audioSamplingRate: 444000,
      codecs: 'my codec',
      contentType: contentType,
      frameRate: 30,
      height: 720,
      mimeType: 'mime type',
      channelsCount: 2,
      pixelAspectRatio: '1:1',
      width: 1280,
    };
  };
  let emptyBuffer = true;
  let bufferStart = 0;
  let bufferEnd = 0;

  const quality1 = createQualityInfo('video', 1);
  const quality2 = createQualityInfo('video', 2);

  const getBufferedInfo = () => {
    if (emptyBuffer) {
      return {
        video: [],
      };
    }
    return {
      video: [{start: bufferStart, end: bufferEnd}],
    };
  };

  beforeEach(() => {
    onQualityChange = jasmine.createSpy('onQualityChange');
    observer = new shaka.media.QualityObserver(getBufferedInfo);
    observer.addEventListener('qualitychange', (event) => {
      shaka.test.Util.spyFunc(onQualityChange)(
          event['quality'], event['position']);
    });
    emptyBuffer = true;
    bufferStart = 0;
    bufferEnd = 0;
  });

  it('does not call onQualityChange when there are no quality changes', () => {
    observer.poll(10, false);
    expect(onQualityChange).not.toHaveBeenCalled();
  });

  it('calls onQualityChange when position is after 1st quality change', () => {
    observer.addMediaQualityChange(quality1, 10);
    emptyBuffer = false;
    bufferStart = 10;
    bufferEnd = 20;
    observer.poll(10, false);
    expect(onQualityChange).toHaveBeenCalledWith(quality1, 10);
  });

  it('does not call onQualityChange when pos advances with no change', () => {
    observer.addMediaQualityChange(quality1, 10);
    emptyBuffer = false;
    bufferStart = 10;
    bufferEnd = 20;
    observer.poll(10, false);
    expect(onQualityChange).toHaveBeenCalledWith(quality1, 10);
    observer.poll(11, false);
    expect(onQualityChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onQualityChange on seek to unbuffered position', () => {
    observer.addMediaQualityChange(quality1, 10);
    emptyBuffer = false;
    bufferStart = 10;
    bufferEnd = 20;
    observer.poll(15, false);
    expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality1, 15]);
    observer.addMediaQualityChange(quality2, 20);
    observer.poll(25, true);
    expect(onQualityChange).not.toHaveBeenCalledOnceMore();
    bufferEnd = 30;
    observer.poll(26, false);
    expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality2, 26]);
  });

  it('calls onQualityChange when position advances over 2nd quality change',
      () => {
        observer.addMediaQualityChange(quality1, 10);
        emptyBuffer = false;
        bufferStart = 10;
        bufferEnd = 20;
        observer.poll(10, false);
        expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality1, 10]);
        observer.addMediaQualityChange(quality2, 20);
        bufferStart = 10;
        bufferEnd = 30;
        observer.poll(20, false);
        expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality2, 20]);
      });

  it('calls onQualityChange when position moves back over a quality chanage',
      () => {
        observer.addMediaQualityChange(quality1, 10);
        emptyBuffer = false;
        bufferStart = 10;
        bufferEnd = 20;
        observer.addMediaQualityChange(quality2, 20);
        bufferStart = 10;
        bufferEnd = 30;
        observer.poll(25, false);
        expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality2, 25]);
        observer.poll(15, false);
        expect(onQualityChange).toHaveBeenCalledOnceMoreWith([quality1, 15]);
      });

  it('uses last applied quality when there are two at the same position',
      () => {
        observer.addMediaQualityChange(quality1, 10);
        observer.addMediaQualityChange(quality2, 10);
        emptyBuffer = false;
        bufferStart = 10;
        bufferEnd = 20;
        observer.poll(15, false);
        expect(onQualityChange).toHaveBeenCalledWith(quality2, 15);
      });
});
