import { useEffect, useState } from 'react';

import { fold } from '@/lib/fold';
import { supabase } from '@/lib/supabase';

export type Suggested = { user_id: string; username: string | null; full_name: string; position: string | null; company_name: string | null };

/**
 * True when what was typed fits one of the texts. Every typed word must be the start of a word,
 * so "de tu" finds "Deniz Türel" and "türel" finds it too. Turkish letters do not matter.
 */
export function fits(typed: string, ...texts: (string | null | undefined)[]) {
  const wanted = fold(typed).split(/[\s@]+/).filter(Boolean);
  if (wanted.length === 0) return true;
  const words = texts.flatMap((text) => fold(text).split(/[\s.,_\-/@]+/)).filter(Boolean);
  const whole = texts.map((text) => fold(text));
  return wanted.every((want) => words.some((word) => word.startsWith(want)) || whole.some((text) => text.startsWith(want)));
}

/** Strips spaces and a leading @ from a typed username. */
export const typedUsername = (text: string) => text.trim().replace(/^@+/, '').toLowerCase();

/**
 * People whose username starts with what is typed (from 2 letters), asked from the server a moment
 * after the last key. Older answers are narrowed on the device meanwhile, so the list never lags.
 */
export function useUsernameSuggestions(text: string, on = true): Suggested[] {
  const typed = typedUsername(text);
  const [people, setPeople] = useState<Suggested[]>([]);
  const wanted = on && typed.length >= 2;

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    const timer = setTimeout(() => {
      supabase.rpc('suggest_people', { q: typed }).then((result) => {
        if (active && result.data) setPeople(result.data as Suggested[]);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [typed, wanted]);

  return wanted ? people.filter((person) => (person.username ?? '').startsWith(typed)) : [];
}
