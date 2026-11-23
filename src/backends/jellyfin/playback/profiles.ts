import type { DeviceCapabilities } from '@/domain';
import { isAudioCodecSupported } from '@/domain';

/**
 * Jellyfin DeviceProfiles (PlaybackInfo). Moved unchanged from the app's
 * constants; only the Jellyfin backend speaks this format.
 */

/**
 * Device profile for native Android playback via ExoPlayer/Media3.
 * Enables AC3/EAC3/DTS DirectPlay, TS container, 8-channel audio, and HDR HEVC.
 */
export const nativeAndroidDeviceProfile = {
    IsPlayback: true,
    AutoOpenLiveStream: true,
    AudioStreamIndex: null,
    SubtitleStreamIndex: null,
    MaxStreamingBitrate: 1000000000,
    AlwaysBurnInSubtitleWhenTranscoding: false,
    EnableAllProbes: true,
    DeviceProfile: {
        MaxStreamingBitrate: 1000000000,
        MaxStaticBitrate: 1000000000,
        MusicStreamingTranscodingBitrate: 384000,
        DirectPlayProfiles: [
            {
                Container: "webm",
                Type: "Video",
                VideoCodec: "vp8,vp9,av1",
                AudioCodec: "vorbis,opus",
            },
            {
                Container: "mp4,m4v",
                Type: "Video",
                VideoCodec: "h264,hevc,vp9,av1",
                AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3,dts,truehd,pcm",
            },
            {
                Container: "mkv,webm",
                Type: "Video",
                VideoCodec: "h264,hevc,vp9,av1",
                AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3,dts,truehd,pcm",
            },
            {
                Container: "mov",
                Type: "Video",
                VideoCodec: "h264,hevc",
                AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3,dts,truehd,pcm",
            },
            {
                Container: "ts",
                Type: "Video",
                VideoCodec: "h264,hevc,mpeg2video",
                AudioCodec: "aac,mp3,mp2,ac3,eac3,dts,pcm",
            },
            { Container: "opus", Type: "Audio" },
            { Container: "webm", AudioCodec: "opus", Type: "Audio" },
            { Container: "ts", AudioCodec: "mp3", Type: "Audio" },
            { Container: "mp3", Type: "Audio" },
            { Container: "aac", Type: "Audio" },
            { Container: "m4a", AudioCodec: "aac", Type: "Audio" },
            { Container: "m4b", AudioCodec: "aac", Type: "Audio" },
            { Container: "flac", Type: "Audio" },
            { Container: "webma", Type: "Audio" },
            { Container: "webm", AudioCodec: "webma", Type: "Audio" },
            { Container: "wav", Type: "Audio" },
            { Container: "ogg", Type: "Audio" },
            {
                Container: "hls",
                Type: "Video",
                VideoCodec: "av1,h264,hevc,vp9",
                AudioCodec: "aac,mp3,opus,ac3,eac3",
            },
        ],
        TranscodingProfiles: [
            {
                Container: "mp4",
                Type: "Audio",
                AudioCodec: "aac",
                Context: "Streaming",
                Protocol: "hls",
                MaxAudioChannels: "8",
                MinSegments: "1",
                BreakOnNonKeyFrames: true,
                EnableAudioVbrEncoding: true,
            },
            {
                Container: "aac",
                Type: "Audio",
                AudioCodec: "aac",
                Context: "Streaming",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            {
                Container: "mp3",
                Type: "Audio",
                AudioCodec: "mp3",
                Context: "Streaming",
                Protocol: "http",
                MaxAudioChannels: "2",
            },
            {
                Container: "opus",
                Type: "Audio",
                AudioCodec: "opus",
                Context: "Streaming",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            {
                Container: "wav",
                Type: "Audio",
                AudioCodec: "wav",
                Context: "Streaming",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            {
                Container: "opus",
                Type: "Audio",
                AudioCodec: "opus",
                Context: "Static",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            {
                Container: "mp3",
                Type: "Audio",
                AudioCodec: "mp3",
                Context: "Static",
                Protocol: "http",
                MaxAudioChannels: "2",
            },
            {
                Container: "aac",
                Type: "Audio",
                AudioCodec: "aac",
                Context: "Static",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            {
                Container: "wav",
                Type: "Audio",
                AudioCodec: "wav",
                Context: "Static",
                Protocol: "http",
                MaxAudioChannels: "8",
            },
            // AAC first: it is the encode target. E-AC3/AC3 let Jellyfin stream-copy
            // the source audio (keeping E-AC3 Atmos) while only the video is
            // transcoded; withDeviceAudioCodecs drops them on devices without them.
            {
                Container: "ts",
                Type: "Video",
                AudioCodec: "aac,eac3,ac3",
                VideoCodec: "h264,hevc,vp9,av1",
                Context: "Streaming",
                Protocol: "hls",
                MaxAudioChannels: "8",
                BreakOnNonKeyFrames: true,
                EnableSubtitlesInManifest: true,
            },
            {
                Container: "mp4",
                Type: "Video",
                AudioCodec: "aac,eac3,ac3",
                VideoCodec: "h264,hevc,vp9,av1",
                Context: "Streaming",
                Protocol: "hls",
                MaxAudioChannels: "8",
                BreakOnNonKeyFrames: true,
            },
        ],
        ContainerProfiles: [],
        // No IsSecondaryAudio restriction: unlike a browser <video>, ExoPlayer
        // selects a non-default audio track inside a DirectPlay file itself.
        CodecProfiles: [
            {
                Type: "Video",
                Codec: "h264",
                Conditions: [
                    {
                        Condition: "NotEquals",
                        Property: "IsAnamorphic",
                        Value: "true",
                        IsRequired: false,
                    },
                    {
                        Condition: "EqualsAny",
                        Property: "VideoProfile",
                        Value: "high|main|baseline|constrained baseline|high 10",
                        IsRequired: false,
                    },
                    {
                        Condition: "LessThanEqual",
                        Property: "VideoLevel",
                        Value: "52",
                        IsRequired: false,
                    },
                    {
                        Condition: "NotEquals",
                        Property: "IsInterlaced",
                        Value: "true",
                        IsRequired: false,
                    },
                ],
            },
            {
                Type: "Video",
                Codec: "hevc",
                Conditions: [
                    {
                        Condition: "NotEquals",
                        Property: "IsAnamorphic",
                        Value: "true",
                        IsRequired: false,
                    },
                    {
                        Condition: "EqualsAny",
                        Property: "VideoProfile",
                        Value: "main|main 10",
                        IsRequired: false,
                    },
                    {
                        Condition: "EqualsAny",
                        Property: "VideoRangeType",
                        Value: "SDR|HDR10|HLG|DOVIWithHDR10",
                        IsRequired: false,
                    },
                    {
                        Condition: "LessThanEqual",
                        Property: "VideoLevel",
                        Value: "183",
                        IsRequired: false,
                    },
                    {
                        Condition: "NotEquals",
                        Property: "IsInterlaced",
                        Value: "true",
                        IsRequired: false,
                    },
                ],
            },
            {
                Type: "Video",
                Codec: "vp9",
                Conditions: [
                    {
                        Condition: "EqualsAny",
                        Property: "VideoRangeType",
                        Value: "SDR|HDR10",
                        IsRequired: false,
                    },
                ],
            },
            {
                Type: "Video",
                Codec: "av1",
                Conditions: [
                    {
                        Condition: "NotEquals",
                        Property: "IsAnamorphic",
                        Value: "true",
                        IsRequired: false,
                    },
                    {
                        Condition: "EqualsAny",
                        Property: "VideoProfile",
                        Value: "main",
                        IsRequired: false,
                    },
                    {
                        Condition: "LessThanEqual",
                        Property: "VideoLevel",
                        Value: "19",
                        IsRequired: false,
                    },
                ],
            },
        ],
        SubtitleProfiles: [
            { Format: "vtt", Method: "External" },
            { Format: "srt", Method: "External" },
            { Format: "ass", Method: "External" },
            { Format: "ssa", Method: "External" },
            { Format: "pgs", Method: "Encode" },
            { Format: "pgssub", Method: "Encode" },
        ],
        ResponseProfiles: [
            { Type: "Video", Container: "m4v", MimeType: "video/mp4" },
        ],
    },
};

export const deviceProfile = {
  IsPlayback: true,
  AutoOpenLiveStream: true,
  AudioStreamIndex: null,
  SubtitleStreamIndex: null,
  MaxStreamingBitrate: 1000000000,
  AlwaysBurnInSubtitleWhenTranscoding: false,
  EnableAllProbes: true,
  DeviceProfile: {
    MaxStreamingBitrate: 1000000000,
    MaxStaticBitrate: 1000000000,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: [
      {
        Container: "webm",
        Type: "Video",
        VideoCodec: "vp8,vp9,av1",
        AudioCodec: "vorbis,opus",
      },
      {
        Container: "mp4,m4v",
        Type: "Video",
        VideoCodec: "h264,hevc,vp9,av1",
        AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3",
      },
      {
        Container: "mkv,webm",
        Type: "Video",
        VideoCodec: "h264,hevc,vp9,av1",
        AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3",
      },
      {
        Container: "mov",
        Type: "Video",
        VideoCodec: "h264,hevc",
        AudioCodec: "aac,mp3,mp2,opus,flac,vorbis,ac3,eac3",
      },
      { Container: "opus", Type: "Audio" },
      { Container: "webm", AudioCodec: "opus", Type: "Audio" },
      { Container: "ts", AudioCodec: "mp3", Type: "Audio" },
      { Container: "mp3", Type: "Audio" },
      { Container: "aac", Type: "Audio" },
      { Container: "m4a", AudioCodec: "aac", Type: "Audio" },
      { Container: "m4b", AudioCodec: "aac", Type: "Audio" },
      { Container: "flac", Type: "Audio" },
      { Container: "webma", Type: "Audio" },
      { Container: "webm", AudioCodec: "webma", Type: "Audio" },
      { Container: "wav", Type: "Audio" },
      { Container: "ogg", Type: "Audio" },
      {
        Container: "hls",
        Type: "Video",
        VideoCodec: "av1,h264,hevc,vp9",
        AudioCodec: "aac,mp3,opus",
      },
      {
        Container: "hls",
        Type: "Video",
        VideoCodec: "h264",
        AudioCodec: "aac,mp3",
      },
    ],
    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Audio",
        AudioCodec: "aac",
        Context: "Streaming",
        Protocol: "hls",
        MaxAudioChannels: "2",
        MinSegments: "1",
        BreakOnNonKeyFrames: true,
        EnableAudioVbrEncoding: true,
      },
      {
        Container: "aac",
        Type: "Audio",
        AudioCodec: "aac",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "mp3",
        Type: "Audio",
        AudioCodec: "mp3",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "opus",
        Type: "Audio",
        AudioCodec: "opus",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "wav",
        Type: "Audio",
        AudioCodec: "wav",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "opus",
        Type: "Audio",
        AudioCodec: "opus",
        Context: "Static",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "mp3",
        Type: "Audio",
        AudioCodec: "mp3",
        Context: "Static",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "aac",
        Type: "Audio",
        AudioCodec: "aac",
        Context: "Static",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "wav",
        Type: "Audio",
        AudioCodec: "wav",
        Context: "Static",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "ts",
        Type: "Video",
        AudioCodec: "aac",
        VideoCodec: "h264,hevc,vp9,av1",
        Context: "Streaming",
        Protocol: "hls",
        MaxAudioChannels: "6",
        BreakOnNonKeyFrames: true,
        EnableSubtitlesInManifest: true,
      },
      {
        Container: "mp4",
        Type: "Video",
        AudioCodec: "aac",
        VideoCodec: "h264,hevc,vp9,av1",
        Context: "Streaming",
        Protocol: "hls",
        MaxAudioChannels: "6",
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: "VideoAudio",
        Codec: "aac",
        Conditions: [
          {
            Condition: "Equals",
            Property: "IsSecondaryAudio",
            Value: "false",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "VideoAudio",
        Conditions: [
          {
            Condition: "Equals",
            Property: "IsSecondaryAudio",
            Value: "false",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "h264",
        Conditions: [
          {
            Condition: "NotEquals",
            Property: "IsAnamorphic",
            Value: "true",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoProfile",
            Value: "high|main|baseline|constrained baseline|high 10",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoRangeType",
            Value: "SDR",
            IsRequired: true,
          },
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "52",
            IsRequired: false,
          },
          {
            Condition: "NotEquals",
            Property: "IsInterlaced",
            Value: "true",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "hevc",
        Conditions: [
          {
            Condition: "NotEquals",
            Property: "IsAnamorphic",
            Value: "true",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoProfile",
            Value: "main|main 10",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoRangeType",
            Value: "SDR|HDR10|HLG|DOVIWithHDR10",
            IsRequired: false,
          },
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "183",
            IsRequired: false,
          },
          {
            Condition: "NotEquals",
            Property: "IsInterlaced",
            Value: "true",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "vp9",
        Conditions: [
          {
            Condition: "EqualsAny",
            Property: "VideoRangeType",
            Value: "SDR",
            IsRequired: true,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "av1",
        Conditions: [
          {
            Condition: "NotEquals",
            Property: "IsAnamorphic",
            Value: "true",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoProfile",
            Value: "main",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoRangeType",
            Value: "SDR",
            IsRequired: true,
          },
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "19",
            IsRequired: false,
          },
        ],
      },
    ],
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
      { Format: "pgs", Method: "Encode" },
      { Format: "pgssub", Method: "Encode" },
    ],
    ResponseProfiles: [
      { Type: "Video", Container: "m4v", MimeType: "video/mp4" },
    ],
  },
};


interface CodecListProfile {
  Type?: string;
  AudioCodec?: string;
}

function supportedAudioCodecs(codecList: string, device: DeviceCapabilities): string {
  return codecList.split(',').filter((codec) => isAudioCodecSupported(codec, undefined, device)).join(',');
}

/**
 * Restrict the video profiles' audio codec lists to what this device decodes,
 * so Jellyfin never direct plays or stream-copies an undecodable audio track.
 * An empty AudioCodec means "any codec" to Jellyfin, so a DirectPlay profile
 * left without codecs is dropped and a transcode target falls back to AAC.
 */
export function withDeviceAudioCodecs<T extends {
  DirectPlayProfiles?: CodecListProfile[];
  TranscodingProfiles?: CodecListProfile[];
}>(profile: T, device: DeviceCapabilities): T {
  if (!device.isKnown) return profile;
  const directPlayProfiles = profile.DirectPlayProfiles
    ?.map((p) => (p.Type === 'Video' && p.AudioCodec ? { ...p, AudioCodec: supportedAudioCodecs(p.AudioCodec, device) } : p))
    .filter((p) => p.AudioCodec !== '');
  const transcodingProfiles = profile.TranscodingProfiles
    ?.map((p) => (p.Type === 'Video' && p.AudioCodec ? { ...p, AudioCodec: supportedAudioCodecs(p.AudioCodec, device) || 'aac' } : p));
  return {
    ...profile,
    ...(directPlayProfiles ? { DirectPlayProfiles: directPlayProfiles } : {}),
    ...(transcodingProfiles ? { TranscodingProfiles: transcodingProfiles } : {}),
  };
}

/**
 * Make AAC the only audio target of video transcodes. When the source audio
 * must be re-encoded, a list like 'aac,eac3,ac3' lets Jellyfin keep the
 * source codec (E-AC3 Atmos) as the target; it then serves MP3 under an HLS
 * CODECS list without an audio codec, and ExoPlayer exposes no audio track.
 */
export function withAacTranscodeAudio<T extends { TranscodingProfiles?: CodecListProfile[] }>(profile: T): T {
  return {
    ...profile,
    TranscodingProfiles: profile.TranscodingProfiles?.map((p) => (p.Type === 'Video' ? { ...p, AudioCodec: 'aac' } : p)),
  };
}
