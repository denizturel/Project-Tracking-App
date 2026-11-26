import { type ReactNode } from 'react';

import { currentLang } from '@/lib/prefs';
import { TR, TR_PATTERNS } from '@/lib/tr';

/**
 * The app is written in English. In Turkish, every text is looked up here just before it is shown.
 * Patterns use {0} {1} for text kept as it is (a name), {n} for a number and {t} for a part that is translated too.
 */
const compiled = TR_PATTERNS.map(([pattern, result]) => {
  const kinds: string[] = [];
  const source = pattern
    .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    .replace(/\{(\d|n|t)\}/g, (_all, kind: string) => {
      kinds.push(kind);
      return kind === 'n' ? '(\\d+(?:[.,]\\d+)?)' : '(.+?)';
    });
  return { regex: new RegExp(`^${source}$`, 's'), kinds, result };
});

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const months = () => (currentLang() === 'tr' ? MONTHS_TR : MONTHS_EN);
export const weekdays = () => (currentLang() === 'tr' ? DAYS_TR : DAYS_EN);
/** For dates written by the device itself. */
export const locale = () => (currentLang() === 'tr' ? 'tr-TR' : undefined);

const missing = new Set<string>();

function lookup(core: string): string {
  const exact = TR[core];
  if (exact !== undefined) return exact;
  if (core.endsWith(' *')) return `${lookup(core.slice(0, -2))} *`;
  if (core.startsWith('· ')) return `· ${lookup(core.slice(2))}`;
  if (core.includes(' · ')) return core.split(' · ').map(lookup).join(' · ');
  for (const { regex, kinds, result } of compiled) {
    const match = regex.exec(core);
    if (!match) continue;
    let index = 0;
    return result.replace(/\{(\d|n|t)\}/g, () => {
      const value = match[index + 1];
      const kind = kinds[index];
      index += 1;
      return kind === 't' ? lookup(value) : value;
    });
  }
  if (__DEV__ || (typeof window !== 'undefined' && (window as { __i18nLog?: boolean }).__i18nLog)) {
    if (/[A-Za-z]{3}/.test(core) && !missing.has(core)) {
      missing.add(core);
      console.log(`[i18n-miss] ${core}`);
    }
  }
  return core;
}

/** One text in the person's language. */
export function tr(text: string): string {
  if (currentLang() !== 'tr') return text;
  const core = text.trim();
  if (!core) return text;
  const translated = lookup(core);
  if (translated === core) return text;
  const start = text.length - text.trimStart().length;
  const end = text.length - text.trimEnd().length;
  return text.slice(0, start) + translated + (end ? text.slice(text.length - end) : '');
}

const plain = (value: unknown) => typeof value === 'string' || typeof value === 'number';
const empty = (value: unknown) => value === null || value === undefined || typeof value === 'boolean';

/** What a text box shows: a sentence built from pieces is put together first, so it is translated as a whole. */
export function trChildren(children: ReactNode): ReactNode {
  if (currentLang() !== 'tr') return children;
  if (typeof children === 'string') return tr(children);
  if (!Array.isArray(children)) return children;
  if (children.every((child) => plain(child) || empty(child))) {
    return tr(children.filter(plain).join(''));
  }
  return children.map((child) => (typeof child === 'string' ? tr(child) : child));
}

/** "Sales manager at Eptera", or the Turkish order "Eptera · Sales manager". */
export function jobText(position: string | null | undefined, company: string | null | undefined): string {
  const parts = [position, company].filter(Boolean) as string[];
  return currentLang() === 'tr' ? parts.reverse().join(' · ') : parts.join(' at ');
}

/** Capitals the Turkish way (i becomes İ) for labels shown in capital letters. */
export function capitals(node: ReactNode): ReactNode {
  if (currentLang() !== 'tr') return node;
  if (typeof node === 'string') return node.toLocaleUpperCase('tr');
  if (Array.isArray(node)) return node.map((child) => (typeof child === 'string' ? child.toLocaleUpperCase('tr') : child));
  return node;
}
