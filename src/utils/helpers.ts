export function isAudioType(type: string): boolean {
  return type === 'Audio' || type === 'MusicAlbum' || type === 'MusicArtist';
}

export function typeLabel(t?: string): string {
  if (t === 'Movie') return 'Film';
  if (t === 'Series') return 'Série';
  if (t === 'Season') return 'Saison';
  if (t === 'Episode') return 'Épisode';
  if (t === 'MusicAlbum') return 'Album';
  if (t === 'Audio') return 'Audio';
  if (t === 'Person') return 'Personne';
  return t || '';
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['octets', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  const fixed = val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
  return `${fixed} ${units[i]}`;
}

export function formatTicksDuration(ticks?: number): string {
  if (!ticks) return '';
  const totalSec = Math.floor(ticks / 10_000_000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTicksHuman(ticks?: number): string | null {
  if (!ticks) return null;
  const totalSec = Math.floor(ticks / 10_000_000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
