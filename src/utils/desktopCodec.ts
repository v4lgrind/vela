interface DesktopMediaStream {
  Codec?: string;
  Type?: string;
}

interface DesktopMediaMetadata {
  Container?: string;
  MediaSources?: Array<{ Container?: string; MediaStreams?: DesktopMediaStream[] }>;
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

// The item-level Container can be a raw ffprobe format list (e.g.
// "mov,mp4,m4a,3gp,3g2,mj2"), while MediaSources[0].Container holds the
// normalized value. Prefer the media source and treat the value as a CSV.
function getContainers(metadata: DesktopMediaMetadata): string[] {
  const raw = metadata.MediaSources?.[0]?.Container || metadata.Container || '';
  return String(raw)
    .toLowerCase()
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function needsDesktopTranscode(metadata: DesktopMediaMetadata): boolean {
  const containers = getContainers(metadata);
  if (metadata.Type === 'Audio') {
    return !containers.some((container) => AUDIO_CONTAINERS.has(container));
  }
  if (metadata.Type !== 'Movie' && metadata.Type !== 'Episode') return false;

  const streams = metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
  const videoCodec = String(
    streams.find((stream) => stream.Type === 'Video')?.Codec || '',
  ).toLowerCase();
  const audioCodecs = streams
    .filter((stream) => stream.Type === 'Audio')
    .map((stream) => String(stream.Codec || '').toLowerCase());

  if (containers.includes('mp4') || containers.includes('m4v')) {
    return !MP4_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, MP4_AUDIO_CODECS);
  }

  if (containers.includes('webm')) {
    return !WEBM_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, WEBM_AUDIO_CODECS);
  }

  return true;
}
