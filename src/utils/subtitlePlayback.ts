interface SubtitleStreamLike {
  Codec?: string;
  IsTextSubtitleStream?: boolean;
}

const BITMAP_SUBTITLE_CODECS = new Set([
  'dvb_subtitle',
  'dvbsub',
  'dvd_subtitle',
  'dvdsub',
  'hdmv_pgs_subtitle',
  'pgs',
  'pgsub',
  'pgssub',
  'vobsub',
]);

export function isBitmapSubtitleCodec(codec?: string): boolean {
  return BITMAP_SUBTITLE_CODECS.has(String(codec || '').toLowerCase());
}

export function requiresSubtitleBurnIn(stream: SubtitleStreamLike): boolean {
  if (stream.IsTextSubtitleStream) return false;
  return isBitmapSubtitleCodec(stream.Codec);
}
