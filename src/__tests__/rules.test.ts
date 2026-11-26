/* eslint-disable import/first */
/** Small rules that decide what a person may type or do. */
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { cleanUsername } from '@/components/username-field';
import { canMessage, type MyPerson } from '@/lib/direct';
import { appLink, tokenFrom } from '@/lib/join-link';
import { parseDate } from '@/lib/use-rows';

const person = (over: Partial<MyPerson>): MyPerson => ({
  user_id: 'u', full_name: 'A', position: null, company_name: null, shares_project: false, connection: null, connection_id: null, ...over,
});

describe('usernames', () => {
  it('are stored in small letters without spaces or a leading @', () => {
    expect(cleanUsername('  @@Deniz.Turel ')).toBe('deniz.turel');
  });
});

describe('invite links', () => {
  const token = '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b';
  it('finds the code in a pasted link, a pasted code, or text around it', () => {
    expect(tokenFrom(appLink(token))).toBe(token);
    expect(tokenFrom(`  ${token.toUpperCase()} `)).toBe(token);
    expect(tokenFrom(`https://example.com/join/${token}?x=1`)).toBe(token);
  });
  it('finds nothing in text that holds no code', () => {
    expect(tokenFrom('hello')).toBeNull();
    expect(tokenFrom("'; drop table projects; --")).toBeNull();
  });
});

describe('who can be messaged privately', () => {
  it('someone in a shared project or an accepted connection', () => {
    expect(canMessage(person({ shares_project: true }))).toBe(true);
    expect(canMessage(person({ connection: 'connected' }))).toBe(true);
  });
  it('not a stranger, and not while a connection request is only sent or received', () => {
    expect(canMessage(person({}))).toBe(false);
    expect(canMessage(person({ connection: 'sent' }))).toBe(false);
    expect(canMessage(person({ connection: 'received' }))).toBe(false);
  });
});

describe('dates typed by hand', () => {
  it('accepts day.month.year and year-month-day', () => {
    expect(parseDate('03.12.2026')).toBe('2026-12-03');
    expect(parseDate('3/12/2026')).toBe('2026-12-03');
    expect(parseDate('2026-12-03')).toBe('2026-12-03');
  });
  it('refuses things that are not dates', () => {
    expect(parseDate('tomorrow')).toBeNull();
    expect(parseDate('99.99.2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});
