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
// Chromium demuxes Matroska natively, so MKV direct-plays in Electron as long
// as the codecs are ones Chromium ships decoders for. HEVC (platform-dependent
// hardware decode only) and ac3/eac3/dts (excluded from Chromium's FFmpeg) are
// deliberately absent — those still go through the server transcode.
const MKV_AUDIO_CODECS = new Set(['aac', 'flac', 'mp3', 'opus', 'vorbis']);
const MKV_VIDEO_CODECS = new Set(['av1', 'avc', 'h264', 'vp8', 'vp9']);

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

/**
 * Normalized primary container (e.g. "mp4", "mkv"), suitable as a file
 * extension. Undefined when the metadata carries no container at all.
 */
export function getPrimaryContainer(metadata: DesktopMediaMetadata): string | undefined {
  const [first] = getContainers(metadata);
  return first === 'matroska' ? 'mkv' : first;
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

  // Checked before webm: ffprobe reports MKV files as "matroska,webm", and the
  // webm profile would wrongly reject their h264 video.
  if (containers.includes('mkv') || containers.includes('matroska')) {
    return !MKV_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, MKV_AUDIO_CODECS);
  }

  if (containers.includes('webm')) {
    return !WEBM_VIDEO_CODECS.has(videoCodec)
      || hasUnsupportedCodec(audioCodecs, WEBM_AUDIO_CODECS);
  }

  return true;
}
