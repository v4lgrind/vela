import { createI18n } from 'vue-i18n';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

export type AppLocale = 'fr' | 'en';

/** Device language → app locale: any French variant gives French, everything else English. */
export function resolveLocale(lang: string | undefined): AppLocale {
  return lang?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale(typeof navigator !== 'undefined' ? navigator.language : undefined),
  fallbackLocale: 'en',
  messages: { en, fr },
});

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
}
