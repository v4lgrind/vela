import { i18n } from './index';

/** Human duration: "1h 13m" / "1 h 13 min". */
export function formatDuration(seconds: number): string {
  const { t } = i18n.global;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h && m) return t('duration.hoursMinutes', { h, m });
  if (h) return t('duration.hours', { h });
  return t('duration.minutes', { m });
}

/** Remaining time: "17m left" / "Reste 17 min". */
export function formatRemaining(seconds: number): string {
  return i18n.global.t('duration.remaining', { d: formatDuration(seconds) });
}
