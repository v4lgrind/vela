export function lockLandscape() {
  (window as any).AndroidOrientation?.lockLandscape()
    ?? (screen.orientation as any).lock?.('landscape')?.catch?.(() => {});
}

export function unlockOrientation() {
  (window as any).AndroidOrientation?.unlock()
    ?? (screen.orientation as any).unlock?.();
}
