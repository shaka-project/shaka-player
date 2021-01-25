
goog.require('shaka.test.Dash');
goog.require('shaka.test.FakeNetworkingEngine');
goog.require('shaka.test.Util');
goog.require('shaka.dash.DashParser');

describe('DashParser Manifest Patch', () => {
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  let parser;
  /** @type {!jasmine.Spy} */
  let onEventSpy;
  /** @type {shaka.extern.ManifestParser.PlayerInterface} */
  let playerInterface;

  beforeEach(() => {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();
    onEventSpy = jasmine.createSpy('onEvent');
    playerInterface = {
      networkingEngine: fakeNetEngine,
      filter: (manifest) => Promise.resolve(),
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
    };
  });

  describe('Patching', () => {
    /** @type {string} */
    let mpd;

    /** @type {string} */
    let patchUri;

    beforeEach(() => {
      mpd = [
        '<MPD minBufferTime="PT75S" timeShiftBufferDepth="PT120S"',
        ' type="dynamic"',
        ' availabilityStartTime="1970-01-01T00:00:00Z"',
        ' maxSegmentDuration="PT5S"',
        ' suggestedPresentationDelay="PT0S"',
        ' xmlns="urn:mpeg:dash:schema:mpd-patch:2011"',
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ' xsi:schemaLocation="urn:mpeg:dash:schema:mpd-patch:2020',
        ' DASH-MPDPATCH.xsd">',
        '  <PatchLocation ttl="60"',
        '   >patch.mpd?publishTime=2020-12-12T03:40:55.51Z</PatchLocation>',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="1.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '          <S t="30" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="1" bandwidth="1" />',
        '    </AdaptationSet>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="2.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '          <S t="30" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="2" bandwidth="2" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      fakeNetEngine.setResponseText('dummy://foo/manifest.mpd', mpd);
      patchUri = 'dummy://foo/patch.mpd?publishTime=2020-12-12T03:40:55.51Z';
    });

    it('add attribute', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <add sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline/S[2]" type="@r">2</add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline/S[2]',
      ].join('\n');
      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd, xpath);

      expect(node).not.toBe(null);
      expect(node.getAttribute('r')).toBe('2');
    });

    it('add node', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <add sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline">',
        '     <S t="60" d="33"/>',
        '   </add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline',
      ].join('\n');
      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd, xpath);

      expect(node).not.toBe(null);
      expect(node.childElementCount).toBe(3);
    });

    it('replace attribute', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <replace sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/@timescale"',
        '   >123</replace>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd,
          '/MPD/Period[@id=\'1\']/AdaptationSet[1]/SegmentTemplate');

      expect(node).not.toBe(null);
      expect(node.getAttribute('timescale')).toBe('123');
    });

    it('replace node', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <replace sel="/MPD/PatchLocation">',
        '      <PatchLocation ttl="60"',
        '>patch.mpd?publishTime=2020-12-12T03:40:59.51Z</PatchLocation>',
        '   </replace>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd,
          '/MPD/PatchLocation');

      expect(node).not.toBe(null);
      expect(node.textContent)
          .toBe('patch.mpd?publishTime=2020-12-12T03:40:59.51Z');
    });

    it('remove attribute', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <remove sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/@timescale"></remove>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd,
          '/MPD/Period[@id=\'1\']/AdaptationSet[1]/SegmentTemplate');

      expect(node).not.toBe(null);
      expect(node.hasAttribute('timescale')).toBe(false);
    });

    it('remove node', async () => {
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <remove sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline/S[1]">',
        '   </remove>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start('dummy://foo/manifest.mpd', playerInterface);
      await parser.update();
      /** @type {Element} */
      const mpd = parser.getMpd();

      const xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline',
      ].join('\n');
      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, mpd, xpath);

      expect(node).not.toBe(null);
      expect(node.childElementCount).toBe(1);
    });
  });

  describe('Evict out of window segments', () => {
    /** @type {string} */
    let mpdUri;

    /** @type {string} */
    let patchUri;

    beforeEach(() => {
      mpdUri = 'dummy://foo/manifest.mpd';
      patchUri = 'dummy://foo/patch.mpd?publishTime=2020-12-12T03:40:55.51Z';
    });

    it('remove earliest segment', async () => {
      const mpd = [
        '<MPD minBufferTime="PT75S" timeShiftBufferDepth="PT50S"',
        ' type="dynamic"',
        ' availabilityStartTime="1970-01-01T00:00:00Z"',
        ' maxSegmentDuration="PT5S"',
        ' suggestedPresentationDelay="PT0S"',
        ' xmlns="urn:mpeg:dash:schema:mpd-patch:2011"',
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ' xsi:schemaLocation="urn:mpeg:dash:schema:mpd-patch:2020',
        ' DASH-MPDPATCH.xsd">',
        '  <PatchLocation ttl="60"',
        '   >patch.mpd?publishTime=2020-12-12T03:40:55.51Z</PatchLocation>',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="1.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '          <S t="30" d="30" />',
        '          <S t="60" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="1" bandwidth="1" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <add sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline/S[3]" type="@r">1</add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(mpdUri, mpd);
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start(mpdUri, playerInterface);
      await parser.update();
      /** @type {Element} */
      const dom = parser.getMpd();

      const xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline',
      ].join('\n');
      const evaluator = new XPathEvaluator();
      const node = shaka.dash.DashParser.getNodeByXPath(evaluator, dom, xpath);

      expect(node).not.toBe(null);
      expect(node.childElementCount).toBe(2);
    });

    it('remove segments with r attribute', async () => {
      const mpd = [
        '<MPD minBufferTime="PT75S" timeShiftBufferDepth="PT200S"',
        ' type="dynamic"',
        ' availabilityStartTime="1970-01-01T00:00:00Z"',
        ' maxSegmentDuration="PT5S"',
        ' suggestedPresentationDelay="PT0S"',
        ' xmlns="urn:mpeg:dash:schema:mpd-patch:2011"',
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ' xsi:schemaLocation="urn:mpeg:dash:schema:mpd-patch:2020',
        ' DASH-MPDPATCH.xsd">',
        '  <PatchLocation ttl="60"',
        '   >patch.mpd?publishTime=2020-12-12T03:40:55.51Z</PatchLocation>',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="1.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" r="10"/>',
        '          <S t="330" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="1" bandwidth="1" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <add sel="/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline/S[2]" type="@r">1</add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(mpdUri, mpd);
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start(mpdUri, playerInterface);
      await parser.update();
      /** @type {Element} */
      const dom = parser.getMpd();

      const evaluator = new XPathEvaluator();
      let xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline',
      ].join('\n');
      let node = shaka.dash.DashParser.getNodeByXPath(evaluator, dom, xpath);

      expect(node).not.toBe(null);
      expect(node.childElementCount).toBe(2);

      xpath = [
        '/MPD/Period[@id=\'1\']/AdaptationSet[1]',
        '/SegmentTemplate/SegmentTimeline/S[1]',
      ].join('\n');
      node = shaka.dash.DashParser.getNodeByXPath(evaluator, dom, xpath);
      expect(node).not.toBe(null);
      expect(node.getAttribute('r')).toBe('5');
    });

    it('remove period without segments', async () => {
      const mpd = [
        '<MPD minBufferTime="PT75S" timeShiftBufferDepth="PT40S"',
        ' type="dynamic"',
        ' availabilityStartTime="1970-01-01T00:00:00Z"',
        ' maxSegmentDuration="PT5S"',
        ' suggestedPresentationDelay="PT0S"',
        ' xmlns="urn:mpeg:dash:schema:mpd-patch:2011"',
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ' xsi:schemaLocation="urn:mpeg:dash:schema:mpd-patch:2020',
        ' DASH-MPDPATCH.xsd">',
        '  <PatchLocation ttl="60"',
        '   >patch.mpd?publishTime=2020-12-12T03:40:55.51Z</PatchLocation>',
        '  <Period id="1">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="1.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30" />',
        '          <S t="30" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="1" bandwidth="1" />',
        '    </AdaptationSet>',
        '  </Period>',
        '  <Period id="2" start="PT60.0S">',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <SegmentTemplate timescale="1" media="1.mp4">',
        '        <SegmentTimeline>',
        '          <S t="0" d="30"/>',
        '          <S t="30" d="30" />',
        '        </SegmentTimeline>',
        '      </SegmentTemplate>',
        '      <Representation id="1" bandwidth="1" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>',
      ].join('\n');
      const patchContents = [
        '<Patch xmlns="urn:mpeg:dash:schema:mpd-patch:2020">',
        '   <add sel="/MPD/Period[@id=\'2\']/AdaptationSet[1]',
        '     /SegmentTemplate/SegmentTimeline/S[2]" type="@r">1</add>',
        '</Patch>',
      ].join('\n');
      fakeNetEngine.setResponseText(mpdUri, mpd);
      fakeNetEngine.setResponseText(patchUri, patchContents);

      await parser.start(mpdUri, playerInterface);
      await parser.update();
      /** @type {Element} */
      const dom = parser.getMpd();

      const evaluator = new XPathEvaluator();
      let xpath = [
        '/MPD/Period[@id=\'1\']',
      ].join('\n');
      let node = shaka.dash.DashParser.getNodeByXPath(evaluator, dom, xpath);
      expect(node).toBe(null);

      xpath = [
        '/MPD/Period[@id=\'2\']',
      ].join('\n');
      node = shaka.dash.DashParser.getNodeByXPath(evaluator, dom, xpath);
      expect(node).not.toBe(null);
    });
  });
});
