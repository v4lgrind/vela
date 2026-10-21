import { i18n } from '@/i18n';

/** True for the temporary "audio switch failed, reverting" notice (compared in the current locale). */
export function isAudioRevertNotice(message: string | null): boolean {
  return message === i18n.global.t('player.errors.audioRevert');
}
