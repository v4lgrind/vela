import { describe, it, expect, vi, beforeEach } from 'vitest';

import { downloadService } from '@/services/downloadService';

import { useOfflineArtwork } from './useOfflineArtwork';

const connection = { isFullyOnline: true };
vi.mock('@/store/offline-store', () => ({ useOfflineStore: () => connection }));
vi.mock('@/services/downloadService', () => ({
  downloadService: { getCachedImageUrl: vi.fn(async (id: string) => (id === 'cached' ? 'https://localhost/_capacitor_file_/cached.jpg' : null)) },
}));

beforeEach(() => {
  connection.isFullyOnline = true;
  vi.mocked(downloadService.getCachedImageUrl).mockClear();
});

describe('useOfflineArtwork', () => {
  it('returns the cached url after preload', async () => {
    const { artworkUrl, preload } = useOfflineArtwork();
    await preload(['cached', 'other']);
    expect(artworkUrl('cached', 'https://jf/Items/cached/Images/Primary')).toBe('https://localhost/_capacitor_file_/cached.jpg');
  });

  it('returns the fallback online', async () => {
    const { artworkUrl, preload } = useOfflineArtwork();
    await preload(['other']);
    expect(artworkUrl('other', 'https://jf/Items/other/Images/Primary')).toBe('https://jf/Items/other/Images/Primary');
  });

  it('returns empty offline without cache', async () => {
    connection.isFullyOnline = false;
    const { artworkUrl, preload } = useOfflineArtwork();
    await preload(['other']);
    expect(artworkUrl('other', 'https://jf/Items/other/Images/Primary')).toBe('');
  });

  it('looks each image up once', async () => {
    const { preload } = useOfflineArtwork();
    await preload(['cached', 'other']);
    await preload(['cached', 'other']);
    expect(downloadService.getCachedImageUrl).toHaveBeenCalledTimes(2);
  });
});
