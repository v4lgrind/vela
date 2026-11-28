import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import type { Track } from '@/domain';
import { audioPlayerService } from '@/services/audioPlayerService';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useOfflineStore } from '@/store/offline-store';
import { useSessionStore } from '@/store/session-store';
import { trackToAudioTrack } from '@/utils/audioTrack';
import { logger } from '@/utils/logger';
import { buildMusicActions } from '@/utils/musicActions';
import type { MusicAction, MusicTarget } from '@/utils/musicActions';

import { useToast } from './useToast';

const TOAST_MS = 2000;

/** What the music menus (⋯ and long press) offer for an item, and doing it. */
export function useMusicActions() {
  const route = useRoute();
  const router = useRouter();
  const session = useSessionStore();
  const offline = useOfflineStore();
  const audio = useAudioPlayerStore();
  const toast = useToast();
  const { t } = useI18n();

  function actionsFor(target: MusicTarget, opts: { queueActions?: boolean } = {}): MusicAction[] {
    const pageId = route.params.id;
    return buildMusicActions(target, {
      currentPageId: typeof pageId === 'string' ? pageId : undefined,
      online: offline.isFullyOnline,
      canRadio: !!session.backend?.capabilities.radio,
      queueActions: opts.queueActions ?? true,
    });
  }

  async function tracksOf(target: MusicTarget, track?: Track): Promise<Track[]> {
    if (track) return [track];
    const music = session.backend?.music;
    if (!music) return [];
    if (target.kind === 'album') return music.albumTracks(target.id);
    const item = await session.backend?.catalog.item(target.id);
    return item?.kind === 'track' ? [item] : [];
  }

  async function enqueue(where: 'playNext' | 'addToQueue', target: MusicTarget, track?: Track) {
    const tracks = (await tracksOf(target, track)).map((item) => trackToAudioTrack(item));
    if (!tracks.length) return;
    if (where === 'playNext') audio.playNext(tracks);
    else audio.addToQueue(tracks);
    toast.show(where === 'playNext' ? t('audio.playingNext') : t('audio.addedToQueue'), 'success', TOAST_MS);
  }

  /** `track`: the full track when the caller has it, saves a request. */
  async function run(action: MusicAction, target: MusicTarget, track?: Track) {
    switch (action.type) {
      case 'goToAlbum':
      case 'goToArtist':
        audio.isExpanded = false;
        await router.push({ name: 'ItemDetails', params: { id: action.itemId } });
        return;
      case 'radio':
        await audioPlayerService.startRadio(target);
        return;
      default:
        // Offline, an album's tracks can't be listed: nothing is queued.
        await enqueue(action.type, target, track).catch((e) => logger.warn('[Music] Queue action failed', e));
    }
  }

  return { actionsFor, run };
}
