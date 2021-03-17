goog.require('shaka.media.LiveCatchUpController');
goog.require('shaka.test.Util');

describe('LiveCatchUpController', () => {
  /** @type {!shaka.media.LiveCatchUpController} */
  let controller;

  /** @type {!jasmine.Spy} */
  let getBufferEndSpy;

  /** @type {!jasmine.Spy} */
  let getPlayRateSpy;

  /** @type {!jasmine.Spy} */
  let getPresentationTimeSpy;

  /** @type {!jasmine.Spy} */
  let trickPlaySpy;

  /** @type {!jasmine.Spy} */
  let getServiceDescriptionSpy;


  beforeEach(() => {
    getBufferEndSpy = jasmine.createSpy('getBufferEnd');
    getPlayRateSpy = jasmine.createSpy('getPlayRate');
    getPresentationTimeSpy = jasmine.createSpy('getPresentationTime');
    trickPlaySpy = jasmine.createSpy('trickPlay');
    getServiceDescriptionSpy = jasmine.createSpy('getServiceDescription');

    const playerInterface = {
      getBufferEnd: shaka.test.Util.spyFunc(getBufferEndSpy),
      getPlayRate: shaka.test.Util.spyFunc(getPlayRateSpy),
      getPresentationTime: shaka.test.Util.spyFunc(getPresentationTimeSpy),
      trickPlay: shaka.test.Util.spyFunc(trickPlaySpy),
      getServiceDescription: shaka.test.Util.spyFunc(getServiceDescriptionSpy),
    };

    controller = new shaka.media.LiveCatchUpController(playerInterface);
    controller.enable();
  });

  it('does not change play rate when playback rate is 0', () => {
    getPlayRateSpy.and.returnValue(0);
    controller.updatePlayRate();
    expect(trickPlaySpy).not.toHaveBeenCalled();
  });

  it('changes play rate to default max value', () => {
    getPlayRateSpy.and.returnValue(1);
    getBufferEndSpy.and.returnValue(10);
    getPresentationTimeSpy.and.returnValue(5);
    controller.updatePlayRate();
    expect(trickPlaySpy).toHaveBeenCalledWith(
        controller.getDefaultMaxPlayRate());
  });

  it('changes play rate to ServiceDescription.playbackRate.max', () => {
    const serviceDescription = {
      playbackRate: {
        max: 1.7,
        min: 0.8,
      },
    };
    getPlayRateSpy.and.returnValue(1);
    getBufferEndSpy.and.returnValue(10);
    getPresentationTimeSpy.and.returnValue(5);
    getServiceDescriptionSpy.and.returnValue(serviceDescription);
    controller.updatePlayRate();
    expect(trickPlaySpy).toHaveBeenCalledWith(
        serviceDescription.playbackRate.max);
  });
});
