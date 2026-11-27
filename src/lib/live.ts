import { useSyncExternalStore } from 'react';

/**
 * A counter that goes up whenever something outside this screen may have changed:
 * someone was added to a company, project, group or team, or the app came back
 * to the front. Lists that include it in what they depend on load again by themselves.
 */
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Several changes that arrive together cause one refresh. */
export function somethingChanged() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    version += 1;
    listeners.forEach((listener) => listener());
  }, 400);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveVersion() {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
