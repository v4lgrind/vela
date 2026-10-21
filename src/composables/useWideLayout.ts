import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

/** True when the window is wide enough for the side rail (tablet landscape, desktop). */
export function useWideLayout(): Ref<boolean> {
  const mql = window.matchMedia('(min-width: 1024px)');
  const wide = ref(mql.matches);
  const onChange = (e: { matches: boolean }) => { wide.value = e.matches; };
  mql.addEventListener('change', onChange);
  if (getCurrentScope()) onScopeDispose(() => mql.removeEventListener('change', onChange));
  return wide;
}
