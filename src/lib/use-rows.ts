import { useCallback, useEffect, useState } from 'react';
import { locale } from '@/lib/i18n';
import { useLiveVersion } from '@/lib/live';

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** What each list held the last time it was loaded, so a page opened again shows at once. */
const remembered = new Map<string, unknown[]>();

/** Forget everything, for when another person signs in on this device. */
export function forgetRows() {
  remembered.clear();
  keptChats.clear();
}

/** The messages of chats opened earlier, kept the same way. */
export const keptChats = new Map<string, unknown>();

/**
 * Loads a list from the database. `key` names the list and says when to load again (for example
 * `tasks1:${projectId}`); it must be different for every list in the app; call `reload` after saving something. A list that was
 * loaded before is shown straight away and then brought up to date quietly.
 */
export function useRows<T>(key: string, load: () => Result<T>) {
  // Each list gives its own key (a name for the place in the code plus what it depends on).
  // The code of `load` cannot tell lists apart: on phones every function reads the same.
  const memory = key;
  const [loaded, setLoaded] = useState<{ memory: string; rows: T[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const live = useLiveVersion();

  useEffect(() => {
    let active = true;
    load().then((result) => {
      if (!active) return;
      setError(result.error?.message ?? null);
      if (result.data) {
        remembered.set(memory, result.data);
        setLoaded({ memory, rows: result.data });
      }
    });
    return () => {
      active = false;
    };
    // `load` is rebuilt on every render; `key` and `version` decide when to run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, live]);

  const rows = loaded?.memory === memory ? loaded.rows : ((remembered.get(memory) as T[] | undefined) ?? loaded?.rows ?? null);
  return { rows: rows ?? [], loading: rows === null && error === null, error, reload };
}

/** "3 Dec 2026" */
export function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Accepts 2026-12-03 or 03.12.2026 / 03/12/2026 and returns 2026-12-03, or null when it is not a date. */
export function parseDate(text: string): string | null {
  const value = text.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  let parts = match ? [match[1], match[2], match[3]] : null;
  if (!parts) {
    match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
    parts = match ? [match[3], match[2], match[1]] : null;
  }
  if (!parts) return null;
  const iso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  return Number.isNaN(new Date(`${iso}T00:00:00`).getTime()) ? null : iso;
}
