// Bridge ISO 639-2 (3-letter) language codes — used by the preferences store and
// Jellyfin — against ISO 639-1 (2-letter) codes that ExoPlayer reports after it
// normalises track metadata. Covers the languages offered in Settings plus the
// common bibliographic (639-2/B) alternates.
const ISO_639_2_TO_1: Record<string, string> = {
  eng: 'en',
  fra: 'fr', fre: 'fr',
  spa: 'es',
  deu: 'de', ger: 'de',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  por: 'pt',
  rus: 'ru',
  zho: 'zh', chi: 'zh',
  ara: 'ar',
};

/** Collapse a code to its canonical 2-letter form when known. */
function canonical(code: string): string {
  const c = code.trim().toLowerCase();
  return ISO_639_2_TO_1[c] ?? c;
}

/**
 * True when a stored language preference matches a track's language code,
 * regardless of whether each side is the 2- or 3-letter form. Empty or
 * undetermined ('und') codes never match.
 */
export function languageMatches(pref: string, trackLang: string): boolean {
  if (!pref || !trackLang) return false;
  const p = pref.trim().toLowerCase();
  const t = trackLang.trim().toLowerCase();
  if (!p || !t || p === 'und' || t === 'und') return false;
  return canonical(p) === canonical(t);
}
