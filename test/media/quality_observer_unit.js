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
      label: null,
      roles: null,
      language: null,
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
        audio: [],
      };
    }
    return {
      video: [{start: bufferStart, end: bufferEnd}],
      audio: [{start: bufferStart, end: bufferEnd}],
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

  describe('audiotrackchange', () => {
    /** @type {!jasmine.Spy} */
    let onAudioTrackChange;

    const createAudioQuality = (label, roles, language) => {
      const qi = createQualityInfo('audio', 1);
      qi.label = label;
      qi.roles = roles;
      qi.language = language;
      return qi;
    };

    const audioQuality1 = createAudioQuality('Audio', ['main'], 'en');
    const audioQuality2 = createAudioQuality('Audio', ['alternative'], 'en');
    const audioQuality3 = createAudioQuality('English', ['main'], 'en');
    const audioQuality4 = createAudioQuality('Audio', ['main'], 'jp');
    const audioQuality5 = createAudioQuality('Audio', ['main'], 'en');
    audioQuality5.bandwidth = 2;

    beforeEach(() => {
      onAudioTrackChange = jasmine.createSpy('onAudioTrackChange');
      observer = new shaka.media.QualityObserver(getBufferedInfo);
      observer.addEventListener('audiotrackchange', (event) => {
        shaka.test.Util.spyFunc(onAudioTrackChange)(
            event['quality'], event['position']);
      });
      emptyBuffer = true;
      bufferStart = 0;
      bufferEnd = 0;
    });

    it('does not call onAudioTrackChange when there are no quality changes',
        () => {
          observer.poll(10, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
        });

    it('does not call onAudioTrackChange after 1st quality change', () => {
      observer.addMediaQualityChange(audioQuality1, 10);
      emptyBuffer = false;
      bufferStart = 10;
      bufferEnd = 20;
      observer.poll(10, false);
      expect(onAudioTrackChange).not.toHaveBeenCalled();
    });

    it('does not call onAudioTrackChange when pos advances with no change',
        () => {
          observer.addMediaQualityChange(audioQuality1, 10);
          emptyBuffer = false;
          bufferStart = 10;
          bufferEnd = 20;
          observer.poll(10, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
          observer.poll(11, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
        });

    it('calls onAudioTrackChange after 2nd quality change, if roles changed',
        () => {
          observer.addMediaQualityChange(audioQuality1, 10);
          emptyBuffer = false;
          bufferStart = 10;
          bufferEnd = 20;
          observer.poll(10, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
          observer.addMediaQualityChange(audioQuality2, 20);
          bufferStart = 10;
          bufferEnd = 30;
          observer.poll(20, false);
          expect(onAudioTrackChange)
              .toHaveBeenCalledOnceMoreWith([audioQuality2, 20]);
        });

    it('calls onAudioTrackChange after 2nd quality change, if label changed',
        () => {
          observer.addMediaQualityChange(audioQuality1, 10);
          emptyBuffer = false;
          bufferStart = 10;
          bufferEnd = 20;
          observer.poll(10, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
          observer.addMediaQualityChange(audioQuality3, 20);
          bufferStart = 10;
          bufferEnd = 30;
          observer.poll(20, false);
          expect(onAudioTrackChange)
              .toHaveBeenCalledOnceMoreWith([audioQuality3, 20]);
        });

    it('calls onAudioTrackChange after 2nd quality change, if language changed',
        () => {
          observer.addMediaQualityChange(audioQuality1, 10);
          emptyBuffer = false;
          bufferStart = 10;
          bufferEnd = 20;
          observer.poll(10, false);
          expect(onAudioTrackChange).not.toHaveBeenCalled();
          observer.addMediaQualityChange(audioQuality4, 20);
          bufferStart = 10;
          bufferEnd = 30;
          observer.poll(20, false);
          expect(onAudioTrackChange)
              .toHaveBeenCalledOnceMoreWith([audioQuality4, 20]);
        });
    it('does not call onAudioTrackChange after 2nd quality change ' +
        'when pos advances with no change',
    () => {
      observer.addMediaQualityChange(audioQuality1, 10);
      emptyBuffer = false;
      bufferStart = 10;
      bufferEnd = 20;
      observer.poll(10, false);
      expect(onAudioTrackChange).not.toHaveBeenCalled();
      observer.addMediaQualityChange(audioQuality2, 20);
      bufferStart = 10;
      bufferEnd = 30;
      observer.poll(20, false);
      expect(onAudioTrackChange).toHaveBeenCalledWith(audioQuality2, 20);
      observer.poll(21, false);
      expect(onAudioTrackChange).toHaveBeenCalledTimes(1);
    });

    it('does not calls onAudioTrackChange after 2nd quality change, ' +
        'if only bandwidth changed',
    () => {
      observer.addMediaQualityChange(audioQuality1, 10);
      emptyBuffer = false;
      bufferStart = 10;
      bufferEnd = 20;
      observer.poll(10, false);
      expect(onAudioTrackChange).not.toHaveBeenCalled();
      observer.addMediaQualityChange(audioQuality5, 20);
      bufferStart = 10;
      bufferEnd = 30;
      observer.poll(20, false);
      expect(onAudioTrackChange).not.toHaveBeenCalled();
    });
  });
});
