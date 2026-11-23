import type { DownloadPlan, DownloadRequest } from './download';
import type {
  Album,
  Episode,
  ItemId,
  ImageRef,
  Library,
  MediaItem,
  Person,
  Season,
  Track,
} from './media';
import type { AudioStreamRequest, Lyrics } from './music';
import type { Chapter, Marker, PlaybackPlan, PlaybackReporter, PlaybackRequest, StreamInfo, Trickplay } from './playback';
import type { LibraryQuery, Page, SearchQuery } from './query';
import type { Capabilities, ServerConnection, ServerKind } from './server';

export interface ImageSize {
  width?: number;
  height?: number;
}

export interface CatalogPort {
  libraries(): Promise<Library[]>;
  browse(libraryId: string, query: LibraryQuery): Promise<Page<MediaItem>>;
  genres(libraryId: string): Promise<string[]>;
  item(id: ItemId): Promise<MediaItem>;
  items(ids: ItemId[]): Promise<MediaItem[]>;
  libraryOf(id: ItemId): Promise<string | undefined>;
  /** Movies and episodes started and not finished, most recent first. */
  resumeItems(limit: number): Promise<MediaItem[]>;
  /** Next episode to watch for every series in progress. */
  upNext(limit: number): Promise<Episode[]>;
  /** Next episode to watch in one series. */
  nextEpisode(seriesId: ItemId): Promise<Episode | null>;
  latest(libraryId: string, limit: number): Promise<MediaItem[]>;
  seasons(seriesId: ItemId): Promise<Season[]>;
  episodes(seasonId: ItemId): Promise<Episode[]>;
  seriesEpisodes(seriesId: ItemId): Promise<Episode[]>;
  search(query: SearchQuery): Promise<MediaItem[]>;
  similar(id: ItemId, limit?: number): Promise<MediaItem[]>;
  person(id: string): Promise<Person | null>;
  filmography(personId: string): Promise<MediaItem[]>;
}

export interface MusicPort {
  artistAlbums(artistId: ItemId): Promise<Album[]>;
  artistTracks(artistId: ItemId): Promise<Track[]>;
  albumTracks(albumId: ItemId): Promise<Track[]>;
  playlistTracks(playlistId: ItemId): Promise<Track[]>;
  randomTracks(libraryId: string, limit: number): Promise<Track[]>;
  /** `streamRef`: the track version's file locator, when known (direct file instead of a conversion). */
  streamUrl(trackId: ItemId, request: AudioStreamRequest, streamRef?: string): string;
  lyrics(trackId: ItemId): Promise<Lyrics | null>;
  /** Reports the playback of one track (start / progress / stop). */
  reporter(trackId: ItemId): PlaybackReporter;
}

export interface OfflineProgress {
  itemId: ItemId;
  positionMs: number;
  played: boolean;
  /** Epoch ms of the offline playback. */
  lastPlayedAtMs: number;
}

export interface UserDataPort {
  setPlayed(id: ItemId, played: boolean): Promise<void>;
  /**
   * Pushes progress saved offline unless the server recorded a newer playback
   * ('kept': the server's is more recent and stays).
   */
  pushOfflineProgress(progress: OfflineProgress): Promise<'pushed' | 'kept'>;
}

export interface PlaybackPort {
  negotiate(request: PlaybackRequest): Promise<PlaybackPlan>;
  reporter(plan: PlaybackPlan, itemId: ItemId): PlaybackReporter;
  markers(id: ItemId): Promise<Marker[]>;
  chapters(id: ItemId): Promise<Chapter[]>;
  trickplay(id: ItemId, versionId: string): Promise<Trickplay | null>;
  streamInfo?(plan: PlaybackPlan): Promise<StreamInfo | null>;
}

export interface DownloadPort {
  plan(request: DownloadRequest): Promise<DownloadPlan>;
}

/** What a backend tells the app about its connection while it runs. */
export interface BackendEvents {
  /** The backend moved to another address of the server (e.g. LAN → public after leaving home). */
  onConnectionChange?(connection: ServerConnection): void;
}

/** One signed-in server. Created by the backend registry from a `ServerConnection`. */
export interface MediaBackend {
  readonly kind: ServerKind;
  readonly connection: ServerConnection;
  readonly capabilities: Capabilities;
  /** How Cast reaches this server: its own receiver app, or a stream URL on the Default Media Receiver. */
  readonly castMode: 'jellyfin-receiver' | 'media-url';
  imageUrl(ref: ImageRef, size?: ImageSize): string;
  /** Headers native players and downloads must send to this server. */
  authHeaders(): Record<string, string>;
  catalog: CatalogPort;
  music: MusicPort;
  userData: UserDataPort;
  playback: PlaybackPort;
  downloads: DownloadPort;
  signOut(): Promise<void>;
}
