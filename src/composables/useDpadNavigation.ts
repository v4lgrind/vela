import { onMounted, onUnmounted } from 'vue';

const FOCUSABLE = '[tabindex="0"]:not([disabled]), button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])';

function getCenter(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

function findNext(focused: Element, direction: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el !== focused && !el.closest('[aria-hidden="true"]') && isVisible(el)
  );

  const { x: fx, y: fy, rect: fr } = getCenter(focused);

  const scored: { el: HTMLElement; score: number }[] = [];

  for (const el of candidates) {
    const { x: cx, y: cy, rect: cr } = getCenter(el);
    const dx = cx - fx;
    const dy = cy - fy;

    // Candidate must be primarily in the requested direction
    let inDirection = false;
    switch (direction) {
      case 'right': inDirection = cr.left >= fr.right - 4; break;
      case 'left':  inDirection = cr.right <= fr.left + 4; break;
      case 'down':  inDirection = cr.top >= fr.bottom - 4; break;
      case 'up':    inDirection = cr.bottom <= fr.top + 4; break;
    }
    if (!inDirection) continue;

    // Score: primary axis distance + 0.5 * cross-axis distance
    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross   = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    scored.push({ el, score: primary + 0.5 * cross });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score);
  return scored[0].el;
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function useDpadNavigation() {
  function handleKeydown(e: KeyboardEvent) {
    // Don't intercept when typing in an input/textarea/contenteditable
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
      if (e.key !== 'Escape') return;
    }

    const focused = document.activeElement as HTMLElement;

    let dir: 'up' | 'down' | 'left' | 'right' | null = null;
    switch (e.key) {
      case 'ArrowRight': dir = 'right'; break;
      case 'ArrowLeft':  dir = 'left';  break;
      case 'ArrowDown':  dir = 'down';  break;
      case 'ArrowUp':    dir = 'up';    break;
    }

    if (dir) {
      const next = focused ? findNext(focused, dir) : null;
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    // D-pad center / Enter — trigger click on focused element (unless it's already a button/link)
    if (e.key === 'Enter' && focused && focused !== document.body) {
      if (focused.getAttribute('tabindex') === '0' && focused.tagName !== 'BUTTON' && focused.tagName !== 'A') {
        e.preventDefault();
        focused.click();
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown, { capture: true }));
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown, { capture: true }));
}
