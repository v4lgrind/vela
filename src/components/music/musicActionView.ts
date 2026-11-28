import type { Component } from 'vue';
import { Disc3, ListPlus, ListStart, Radio, UserRound } from 'lucide-vue-next';

import type { MusicAction } from '@/utils/musicActions';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Icon and label of a music menu entry. */
export function musicActionView(action: MusicAction, t: Translate): { icon: Component; label: string } {
  switch (action.type) {
    case 'goToAlbum': return { icon: Disc3, label: t('audio.goToAlbum') };
    case 'goToArtist': return { icon: UserRound, label: t('audio.goToArtist', { name: action.name }) };
    case 'radio': return { icon: Radio, label: t('audio.startRadio') };
    case 'playNext': return { icon: ListStart, label: t('audio.playNext') };
    default: return { icon: ListPlus, label: t('audio.addToQueue') };
  }
}

/** Stable v-for key: one artist entry per artist. */
export function musicActionKey(action: MusicAction): string {
  return action.type === 'goToArtist' ? `${action.type}:${action.itemId}` : action.type;
}

export const MENU_ITEM_CLASS = 'flex items-center gap-2.5 min-h-11 rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none data-highlighted:bg-white/10 cursor-pointer';
export const MENU_CONTENT_CLASS = 'z-300 min-w-44 max-w-72 rounded-xl border border-border-default bg-surface-raised p-1 shadow-xl';

const MENU_EDGE_PX = 8;

function insetPx(name: string): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

/** Keeps menus clear of the status and navigation bars (the WebView draws under them). */
export function menuCollisionPadding() {
  return {
    top: insetPx('--sat') + MENU_EDGE_PX,
    bottom: insetPx('--sab') + MENU_EDGE_PX,
    left: MENU_EDGE_PX,
    right: MENU_EDGE_PX,
  };
}
