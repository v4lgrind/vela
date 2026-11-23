import { describe, expect, it } from 'vitest';

import type { Episode, Movie, Season, Series, Track } from '@/domain';

import continueWatching from '../__fixtures__/hub-continue-watching.json';
import movieDetail from '../__fixtures__/movie-detail.json';
import moviesPage from '../__fixtures__/movies-page.json';
import episodeInProgress from '../__fixtures__/episode-inprogress-1.json';
import sections from '../__fixtures__/sections.json';
import showDetail from '../__fixtures__/show-detail.json';
import showSeasons from '../__fixtures__/show-seasons.json';
import type { PlexContainer, PlexDirectory, PlexMetadata } from '../types';

import { plexImageUrl, toChapters, toLibrary, toMarkers, toMediaItem, videoRange } from './index';

const metadata = (fixture: unknown): PlexMetadata[] => (fixture as PlexContainer).MediaContainer.Metadata ?? [];
const first = (fixture: unknown): PlexMetadata => metadata(fixture)[0];

describe('Plex → domain: movie', () => {
  const dto = first(movieDetail);
  const movie = toMediaItem(dto) as Movie;

  it('maps identity, library and times (already ms)', () => {
    expect(movie).toMatchObject({ kind: 'movie', id: '9245', libraryId: '1', durationMs: 6_454_974, rating: 5 });
    expect(movie.studios).toEqual(['studio 1']);
  });

  it('uses the typed Image list for poster, backdrop and logo', () => {
    expect(movie.images.poster).toMatch(/^\/library\/metadata\/9245\/thumb\//);
    expect(movie.images.backdrop).toMatch(/\/art\//);
    expect(movie.images.logo).toMatch(/\/clearLogo\//);
  });

  it('maps directors, writers, producers and actors to credits', () => {
    const count = (role: string) => movie.credits.filter((c) => c.role === role).length;
    expect([count('director'), count('writer'), count('producer'), count('actor')]).toEqual([1, 3, 1, 31]);
    expect(movie.credits.find((c) => c.role === 'actor')).toMatchObject({ character: 'role 1' });
  });

  it('maps streams with Plex stream ids, kbps → bps, HDR and image subtitles', () => {
    const [version] = movie.versions;
    expect(version.id).toBe('107097');
    expect(version.bitrate).toBe(5_439_000);
    expect(version.video[0]).toMatchObject({ id: '382251', codec: 'hevc', range: 'hdr10', bitDepth: 10 });
    expect(version.audio.map((a) => a.language)).toEqual(['fra', 'eng']);
    expect(version.subtitles.find((s) => s.codec === 'pgs')?.format).toBe('image');
    expect(version.subtitles.filter((s) => s.format === 'text')).toHaveLength(4);
  });

  it('maps watch state: watched once, no resume point, no favourites on Plex', () => {
    expect(movie.user).toMatchObject({ played: true, playCount: 1, favorite: false, resumePositionMs: undefined });
    expect(movie.user.lastPlayedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps several credits markers and the chapters', () => {
    expect(toMarkers(dto.Marker).map((m) => m.kind)).toEqual(['credits', 'credits']);
    const chapters = toChapters(dto.Chapter);
    expect(chapters).toHaveLength(19);
    expect(chapters[1].startMs).toBe(688_688);
  });
});

describe('Plex → domain: shows', () => {
  it('maps an in-progress episode: hierarchy, resume point, series art, intro marker', () => {
    const dto = first(episodeInProgress);
    const episode = toMediaItem(dto) as Episode;
    expect(episode).toMatchObject({
      kind: 'episode', id: '76334', seriesId: '76323', seasonId: '76324', seasonNumber: 1, episodeNumber: 7,
    });
    expect(episode.user).toMatchObject({ played: false, resumePositionMs: 563_515 });
    expect(episode.images.poster).toMatch(/^\/library\/metadata\/76323\//);
    expect(episode.images.thumb).toMatch(/^\/library\/metadata\/76334\//);
    expect(episode.images.backdrop).toMatch(/^\/library\/metadata\/76323\/art/);
    expect(toMarkers(dto.Marker)).toContainEqual({ kind: 'intro', startMs: 118_600, endMs: 206_340 });
    expect(episode.versions[0].audio).toHaveLength(2);
  });

  it('derives series progress from leaf counts', () => {
    const series = toMediaItem(first(showDetail)) as Series;
    expect(series).toMatchObject({ kind: 'series', seasonCount: 3, episodeCount: 76 });
    expect(series.user).toMatchObject({ played: false, unplayedCount: 76 });
  });

  it('maps seasons with their number and episode count', () => {
    const seasons = metadata(showSeasons).map(toMediaItem) as Season[];
    expect(seasons.map((s) => [s.kind, s.seasonNumber, s.episodeCount])).toEqual([
      ['season', 1, 5], ['season', 2, 21], ['season', 17, 50],
    ]);
  });

  it('maps a mixed continue-watching hub', () => {
    expect(metadata(continueWatching).map((m) => toMediaItem(m).kind))
      .toEqual(['movie', 'movie', 'episode', 'movie', 'episode', 'episode']);
  });
});

describe('Plex → domain: music, libraries, misc', () => {
  it('maps a track with album cover, artist and lyrics stream', () => {
    const track = toMediaItem({
      ratingKey: '5', type: 'track', title: 'Song', parentRatingKey: '4', parentTitle: 'Album', parentThumb: '/a/thumb',
      grandparentRatingKey: '3', grandparentTitle: 'Artist', index: 2, parentIndex: 1, duration: 200_000,
      Media: [{ id: 1, Part: [{ id: 1, key: '/p', Stream: [{ id: 9, streamType: 4, codec: 'lrc' }] }] }],
    }) as Track;
    expect(track).toMatchObject({ kind: 'track', albumId: '4', trackNumber: 2, hasLyrics: true, durationMs: 200_000 });
    expect(track.artists).toEqual([{ id: '3', name: 'Artist' }]);
    expect(track.images.poster).toBe('/a/thumb');
  });

  it('maps library sections to library kinds', () => {
    const dirs = (sections as PlexContainer).MediaContainer.Directory as PlexDirectory[];
    expect(dirs.map((d) => toLibrary(d).kind)).toEqual(['movies', 'movies', 'shows', 'shows', 'shows', 'music', 'music']);
  });

  it('reports paging totals', () => {
    expect((moviesPage as PlexContainer).MediaContainer.totalSize).toBe(1305);
  });

  it('builds photo-transcoder URLs that carry the token (img tags cannot send headers)', () => {
    const url = new URL(plexImageUrl('https://pms.example:32400', 'tok', '/library/metadata/1/thumb/2', { width: 300 }));
    expect(url.pathname).toBe('/photo/:/transcode');
    expect(url.searchParams.get('url')).toBe('/library/metadata/1/thumb/2');
    expect(url.searchParams.get('width')).toBe('300');
    expect(url.searchParams.get('X-Plex-Token')).toBe('tok');
  });

  it('uses agent image URLs as they are', () => {
    expect(plexImageUrl('https://pms.example:32400', 'tok', 'https://metadata-static.plex.tv/p/x.jpg')).toBe('https://metadata-static.plex.tv/p/x.jpg');
  });

  it('normalises video ranges', () => {
    expect(videoRange({ colorTrc: 'smpte2084' })).toBe('hdr10');
    expect(videoRange({ colorTrc: 'arib-std-b67' })).toBe('hlg');
    expect(videoRange({ colorTrc: 'smpte2084', DOVIPresent: true })).toBe('dolby-vision');
    expect(videoRange({ colorTrc: 'bt709' })).toBe('sdr');
  });
});
