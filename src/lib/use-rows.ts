import { useCallback, useEffect, useState } from 'react';

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Loads a list from the database. `key` says when to load again (for example
 * the project id); call `reload` after saving something.
 */
export function useRows<T>(key: string, load: () => Result<T>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    load().then((result) => {
      if (!active) return;
      setError(result.error?.message ?? null);
      if (result.data) setRows(result.data);
    });
    return () => {
      active = false;
    };
    // `load` is rebuilt on every render; `key` and `version` decide when to run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  return { rows: rows ?? [], loading: rows === null && error === null, error, reload };
}

/** "3 Dec 2026" */
export function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
