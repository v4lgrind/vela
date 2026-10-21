// Space the app shell (nav bar or rail, mini player) takes around the routed page.
// --sab/--sal are the measured insets (MainActivity), env() is the web fallback.
const SAB = 'var(--sab, env(safe-area-inset-bottom, 0px))';
const RAIL = 'calc(88px + var(--sal, env(safe-area-inset-left, 0px)))';
// Floating bar: 66px tall, 16px offset, 8px gap. Mini player: 64px.
const BAR_CLEAR = '98px';
const MINI = '64px';

type Shell = { navVisible: boolean; wide: boolean; miniVisible: boolean };

/**
 * Space reserved around the routed page so content never sits under the shell.
 * marginLeft goes on a wrapper (an inline padding on the page root would override its gutter);
 * paddingBottom goes on the page root so h-dvh pages keep their height.
 */
export function contentStyle({ navVisible, wide, miniVisible }: Shell): Record<string, string> {
  if (navVisible && wide) {
    return { marginLeft: RAIL, paddingBottom: miniVisible ? `calc(72px + ${SAB})` : SAB };
  }
  if (navVisible) {
    return { paddingBottom: miniVisible ? `calc(${BAR_CLEAR} + ${MINI} + ${SAB})` : `calc(${BAR_CLEAR} + ${SAB})` };
  }
  return miniVisible ? { paddingBottom: '72px' } : {};
}

/** Position of the mini player; undefined = pinned to the bottom edge by the template (no nav). */
export function miniPlayerStyle({ navVisible, wide }: Omit<Shell, 'miniVisible'>): Record<string, string> | undefined {
  if (!navVisible) return undefined;
  return wide ? { left: RAIL, bottom: SAB } : { bottom: `calc(90px + ${SAB})` };
}
