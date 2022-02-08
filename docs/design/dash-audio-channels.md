# Counting DASH Audio Channels

Shaka Player parses channel count information from HLS manifests, but not yet
from DASH manifests.  We have had an [open request][dash_channels_request] to
do this for a year.

[dash_channels_request]: https://github.com/google/shaka-player/issues/424


## The DASH Spec

A DASH manifest does not contain a simple count of audio channels.  Instead, it
has a more general description of the audio channel "configuration", including
the desired speaker layout.  Further, the way this is described is extensible,
and there is no single format for this metadata.

The DASH spec says this of the <AudioChannelConfiguration> element:

> For the element AudioChannelConfiguration the @schemeIdUri attribute is used
> to identify the audio channel configuration scheme employed.  Multiple
> AudioChannelConfiguration elements may be present indicating that the
> Representation supports multiple audio channel configurations. For example, it
> may describe a Representation that includes MPEG Surround audio supporting
> stereo and multichannel. If the scheme or the value for this descriptor is not
> recognized the DASH client is expected to ignore the descriptor.
>
> The descriptor may carry audio channel configuration using the URN label and
> values defined for OutputChannelPosition in ISO/IEC 23001-8.
>
> NOTE: A scheme for audio channel configuration is also defined in 5.8.5.4 of
> this part of ISO/IEC 23009. This scheme is maintained for
> backward-compatibility, but it recommended to use the signalling as defined in
> ISO/IEC 23001-8.

> 5.8.5.4 Audio channel configuration schemes
>
> The following defines a URI that identifies channel configuration signalling
> for Representations that contain an audio component. The URI
> 'urn:mpeg:dash:23003:3:audio\_channel\_configuration:2011' is defined to
> indicate the channel configuration as defined by Table 68 (Channel
> Configurations, meaning of channelConfigurationIndex, mapping of channel
> elements to loudspeaker positions') of ISO/IEC 23003-3. The @value shall be
> the value as defined for OutputChannelPosition in ISO/IEC 23001-8.
>
> The URN 'urn:mpeg:dash:outputChannelPositionList:2012' defines a list of
> output channel positions to signal individual speaker positions. The @value
> shall be a space-delimited list of values as defined of the
> OutputChannelPosition as defined in ISO/IEC 23001-8. For example, the @value
> for the 7.1 channel configuration 2 high as 2/0/0, 5 mid as 3/0/2 and 0.1 low,
> where a/b/c indicates speaker count in front, side and back, respectively and
> 0.1 indicates a subwoofer channel), is '2 0 1 4 5 3 17 1'.


## Schemes

### urn:mpeg:dash:outputChannelPositionList:2012

This is described in the DASH spec as a list of OutputPosition values from
ISO/IEC 23001-8:2016.  That spec gives a table in which 43 explicit speaker
positions are given numerical values.  It would seem that when using this scheme
in DASH, the @value attribute is a space-separated list of these speaker
position values.  Therefore the number of channels is the length of this list.


### urn:mpeg:dash:23003:3:audio\_channel\_configuration:2011

The DASH spec says this is "the channel configuration as defined by Table 68 ...
of ISO/IEC 23003-3. The @value shall be the value as defined for
OutputChannelPosition in ISO/IEC 23001-8."

The statement about OutputChannelPosition and 23001-8 conflicts with available
evidence.  Both Shaka Packager and the [open source DASH encoder from Cast
Labs][cast_labs_23003] use [the number of channels in the @value
attribute][shaka_packager_23003]. Therefore, we assume that 23003-3 defines this
very simply as the number of channels, and that the second statement about
23001-8 was added to that paragraph in error.

Neither 23003-3 nor the DASH spec corrigenda were freely available at the time
of this writing, so we have not confirmed these assumptions.

[cast_labs_23003]: https://github.com/castlabs/dashencrypt/blob/1d604896/dash.fragmencrypter/src/main/java/com/castlabs/dash/helpers/DashHelper.java#L193
[shaka_packager_23003]: https://github.com/google/shaka-packager/blob/4ba5bec6/packager/mpd/base/xml/xml_node.cc#L378


### tag:dolby.com,2014:dash:audio\_channel\_configuration:2011

The [DASH-IF website][dash_if_audio_config] also lists the
"tag:dolby.com,2014:dash:audio\_channel\_configuration:2011" scheme, with the
description:

> Dolby audio channel configuration information. The @value attribute shall
> contain a four digit hexadecimal representation of the 16 bit field that
> describes the channel assignment as defined by table E.5 in ETSI TS 102 366
> where left channel is MSB. For example, for a stream with L, C, R, Ls, Rs,
> LFE, the value shall be 'F801' (hexadecimal equivalent of the binary value
> 1111 1000 0000 0001).

From the example, it would appear that each channel is represented by a single
bit, so we could count the number of one-bits.  [An enumeration in Shaka
Packager][shaka_packager_ec3_enum] supports this interpretation.  This has not
been confirmed from primary sources.

[dash_if_audio_config]: http://dashif.org/identifiers/audio-source-data/
[shaka_packager_ec3_enum]: https://github.com/google/shaka-packager/blob/47363dd0/packager/media/codecs/ec3_audio_util.cc#L34


### urn:dts:dash:audio\_channel\_configuration:2012

The DASH encoder from Cast Labs also supports
"urn:dts:dash:audio\_channel\_configuration:2012" for DTS, which [seems to be a
simple channel count][cast_labs_dash_2012].

[cast_labs_dash_2012]: https://github.com/castlabs/dashencrypt/blob/1d604896/dash.fragmencrypter/src/main/java/com/castlabs/dash/helpers/DashHelper.java#L321


### urn:dolby:dash:audio\_channel\_configuration:2011

The DASH encoder from Cast Labs also supports
"urn:dolby:dash:audio\_channel\_configuration:2011" for AC3 and EC3, which
[seems to be identical to the hex string][cast_labs_dolby] used in the
"tag:dolby.com,2014:dash:audio\_channel\_configuration:2011" scheme above.

[cast_labs_dolby]: https://github.com/castlabs/dashencrypt/blob/1d604896/dash.fragmencrypter/src/main/java/com/castlabs/dash/helpers/DashHelper.java#L100
