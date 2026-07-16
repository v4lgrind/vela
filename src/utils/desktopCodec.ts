interface DesktopMediaStream {
  Codec?: string;
  Type?: string;
}

interface DesktopMediaMetadata {
  Container?: string;
  MediaSources?: Array<{ MediaStreams?: DesktopMediaStream[] }>;
  MediaStreams?: DesktopMediaStream[];
  Type?: string;
}

const AUDIO_CONTAINERS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav']);
const MP4_AUDIO_CODECS = new Set(['aac', 'mp3']);
const MP4_VIDEO_CODECS = new Set(['avc', 'h264']);
const WEBM_AUDIO_CODECS = new Set(['opus', 'vorbis']);
const WEBM_VIDEO_CODECS = new Set(['av1', 'vp8', 'vp9']);

function hasUnsupportedCodec(codecs: string[], supportedCodecs: Set<string>): boolean {
  return codecs.some((codec) => !supportedCodecs.has(codec));
}

export function needsDesktopTranscode(metadata: DesktopMediaMetadata): boolean {
  const container = String(metadata.Container || '').toLowerCase();
  if (metadata.Type === 'Audio') return !AUDIO_CONTAINERS.has(container);
  if (metadata.Type !== 'Movie' && metadata.Type !== 'Episode') return false;

  const streams = metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
  const videoCodec = String(
    streams.find((stream) => stream.Type === 'Video')?.Codec || '',
  ).toLowerCase();
  const audioCodecs = streams
    .filter((stream) => stream.Type === 'Audio')
    .map((stream) => String(stream.Codec || '').toLowerCase());

  if (container === 'mp4' || container === 'm4v') {
    return !MP4_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, MP4_AUDIO_CODECS);
  }

  if (container === 'webm') {
    return !WEBM_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, WEBM_AUDIO_CODECS);
  }

  return true;
}
