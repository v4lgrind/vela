import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { describe, expect, it } from 'vitest';

import type { Episode, Movie, Season, Series, Track } from '@/domain';

import movieDetail from '../__fixtures__/movie-detail.json';
import resume from '../__fixtures__/resume.json';
import seasonEpisodes from '../__fixtures__/season-episodes.json';
import showSeasons from '../__fixtures__/show-seasons.json';
import showsPage from '../__fixtures__/shows-page.json';
import userViews from '../__fixtures__/user-views.json';

import {
  jellyfinImageUrl,
  toChapters,
  toLibrary,
  toLyrics,
  toMarkers,
  toMediaItem,
  videoRange,
} from './index';

const items = (page: { Items: unknown[] }): BaseItemDto[] => page.Items as BaseItemDto[];

describe('Jellyfin → domain: movie', () => {
  const movie = toMediaItem(items(movieDetail)[0]) as Movie;

  it('maps identity, text and ticks to ms', () => {
    expect(movie.kind).toBe('movie');
    expect(movie.title).toBe('Amber Coast');
    expect(movie.durationMs).toBe(items(movieDetail)[0].RunTimeTicks! / 10_000);
    expect(movie.genres.length).toBeGreaterThan(0);
    expect(movie.studios).toEqual(['Studio Halcyon']);
  });

  it('builds image refs only for images that exist', () => {
    expect(movie.images.poster).toBeDefined();
    expect(movie.images.backdrop).toBeDefined();
    expect(movie.images.logo).toBeDefined();
    expect(movie.images.thumb).toBeUndefined();
  });

  it('maps people to credits with roles and characters', () => {
    expect(movie.credits[0]).toMatchObject({ name: 'Maren Holt', role: 'director', character: 'Ines' });
    expect(movie.credits.filter((c) => c.role === 'actor')).toHaveLength(6);
    expect(movie.credits[0].image).toBeDefined();
  });

  it('maps media streams with opaque ids and normalised ranges', () => {
    const [version] = movie.versions;
    expect(version.video[0]).toMatchObject({ id: '0', codec: 'hevc', range: 'hdr10', width: 3840 });
    expect(version.audio.map((a) => a.id)).toEqual(['1', '2']);
    expect(version.audio[0]).toMatchObject({ codec: 'eac3', channels: 6, isDefault: true });
    expect(version.subtitles.map((s) => s.format)).toEqual(['text', 'image']);
  });

  it('treats an unstarted item as having no resume point', () => {
    expect(movie.user).toMatchObject({ played: false, favorite: false, resumePositionMs: undefined });
  });
});

describe('Jellyfin → domain: shows', () => {
  it('maps a series with its status', () => {
    const series = toMediaItem(items(showsPage)[0]) as Series;
    expect(series).toMatchObject({ kind: 'series', title: 'Cold Signal', status: 'continuing', seasonCount: 1 });
  });

  it('maps a season with its unplayed count', () => {
    const season = toMediaItem(items(showSeasons)[0]) as Season;
    expect(season).toMatchObject({ kind: 'season', seasonNumber: 1 });
    expect(season.user.unplayedCount).toBe(3);
    expect(season.seriesId).not.toBe('');
  });

  it('maps an episode: numbering, resume point, series poster and backdrop', () => {
    const dto = items(seasonEpisodes)[5];
    const episode = toMediaItem(dto) as Episode;
    expect(episode).toMatchObject({ kind: 'episode', seasonNumber: 1, episodeNumber: 6, seriesId: dto.SeriesId });
    expect(episode.user.resumePositionMs).toBe(15 * 60 * 1000);
    expect(episode.images.poster?.startsWith(dto.SeriesId!)).toBe(true);
    expect(episode.images.thumb?.startsWith(dto.Id!)).toBe(true);
    expect(episode.images.backdrop?.startsWith(dto.SeriesId!)).toBe(true);
  });

  it('gives a season the series backdrop only when the series has one', () => {
    const withBackdrop = toMediaItem({ Id: 's1', Type: 'Season', SeriesId: 'x', ParentBackdropItemId: 'x', ParentBackdropImageTags: ['t'] });
    expect(withBackdrop.images.backdrop).toBe('x/Backdrop/t');
    const without = toMediaItem({ Id: 's1', Type: 'Season', SeriesId: 'x', ImageTags: { Primary: 'p' }, ParentBackdropImageTags: [] });
    expect(without.images.backdrop).toBeUndefined();
    expect(without.images.poster).toBe('s1/Primary/p');
  });

  it('maps a mixed resume list', () => {
    expect(items(resume).map((dto) => toMediaItem(dto).kind)).toEqual(['movie', 'episode', 'movie']);
  });
});

describe('Jellyfin → domain: music', () => {
  it('maps a track with album art and artists', () => {
    const track = toMediaItem({
      Id: 't1', Type: 'Audio', Name: 'Paper Moon', AlbumId: 'a1', Album: 'Marées', AlbumPrimaryImageTag: 'x',
      ArtistItems: [{ Id: 'ar1', Name: 'Solenne' }], IndexNumber: 4, ParentIndexNumber: 1, HasLyrics: true,
      RunTimeTicks: 2_000_000_000,
    }) as Track;
    expect(track).toMatchObject({ kind: 'track', albumId: 'a1', trackNumber: 4, discNumber: 1, hasLyrics: true, durationMs: 200_000 });
    expect(track.artists).toEqual([{ id: 'ar1', name: 'Solenne' }]);
    expect(track.images.poster).toBe('a1/Primary/x');
  });

  it('keeps the loudness gain the server measured', () => {
    expect((toMediaItem({ Id: 't1', Type: 'Audio', NormalizationGain: -7.5 }) as Track).gainDb).toBe(-7.5);
    expect((toMediaItem({ Id: 't2', Type: 'Audio', NormalizationGain: null }) as Track).gainDb).toBeUndefined();
  });

  it('maps unknown types to other', () => {
    expect(toMediaItem({ Id: 'f', Type: 'Folder', Name: 'x' }).kind).toBe('other');
  });
});

describe('Jellyfin → domain: libraries, markers, chapters, lyrics', () => {
  it('maps user views to library kinds', () => {
    expect(items(userViews).map((v) => toLibrary(v).kind)).toEqual(['movies', 'shows', 'music']);
    expect(toLibrary({ Id: 'x', Name: 'Mixed' }).kind).toBe('mixed');
    expect(toLibrary({ Id: 'y', Name: 'Books', CollectionType: 'books' }).kind).toBe('other');
  });

  it('maps media segments to markers, dropping unknown kinds', () => {
    const markers = toMarkers([
      { Type: 'Intro', StartTicks: 0, EndTicks: 300_000_000 },
      { Type: 'Outro', StartTicks: 50_000_000_000, EndTicks: 52_000_000_000 },
      { Type: 'Commercial', StartTicks: 1, EndTicks: 2 },
    ]);
    expect(markers).toEqual([
      { kind: 'intro', startMs: 0, endMs: 30_000 },
      { kind: 'credits', startMs: 5_000_000, endMs: 5_200_000 },
    ]);
  });

  it('ends each chapter where the next starts', () => {
    const chapters = toChapters([{ Name: 'A', StartPositionTicks: 0 }, { Name: 'B', StartPositionTicks: 600_000_000 }], 120_000);
    expect(chapters).toEqual([
      { title: 'A', startMs: 0, endMs: 60_000 },
      { title: 'B', startMs: 60_000, endMs: 120_000 },
    ]);
  });

  it('maps synced and unsynced lyrics', () => {
    expect(toLyrics({ Lyrics: [{ Text: 'a', Start: 40_000_000 }] })).toEqual({ synced: true, lines: [{ text: 'a', startMs: 4000 }] });
    expect(toLyrics({ Lyrics: [{ Text: 'a' }] })?.synced).toBe(false);
    expect(toLyrics({ Lyrics: [] })).toBeNull();
  });
});

describe('Jellyfin image URLs and ranges', () => {
  it('builds a sized, tagged image URL from a ref', () => {
    expect(jellyfinImageUrl('https://jf.example', 'abc/Primary/t1', { width: 300 }))
      .toBe('https://jf.example/Items/abc/Images/Primary?tag=t1&quality=80&maxWidth=300');
  });

  it('normalises video ranges', () => {
    expect(videoRange({ VideoRangeType: 'DOVIWithHDR10' })).toBe('dolby-vision');
    expect(videoRange({ VideoRangeType: 'HDR10Plus' })).toBe('hdr10+');
    expect(videoRange({ VideoRange: 'SDR' })).toBe('sdr');
    expect(videoRange({})).toBe('unknown');
  });
});
