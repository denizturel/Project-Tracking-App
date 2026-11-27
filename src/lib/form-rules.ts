/**
 * One standard for what people type about themselves, used by sign-up,
 * the work-details step, Profile and Change password.
 */

/** "Ayşe Nur" + "Yılmaz" are kept together as one full name; the last word is the surname. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const words = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { first: words[0] ?? '', last: '' };
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}

export function joinName(first: string, last: string) {
  return `${first} ${last}`.trim().replace(/\s+/g, ' ');
}

/** Emails are saved without spaces and in small letters. */
export function cleanEmail(text: string) {
  return text.trim().toLowerCase();
}

export function emailProblem(text: string): string | null {
  const email = cleanEmail(text);
  if (!email) return null;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? null : 'This email address does not look right. Example: name@company.com';
}

/**
 * Phone numbers are saved in the international form: + country code and digits only (+905321234567).
 * Spaces, dashes and brackets are dropped, 00 becomes +, and a Turkish mobile typed
 * as 0532… or 532… gets +90 in front. Returns null when it cannot be a phone number.
 */
export function cleanPhone(text: string): string | null {
  let digits = text.trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^05\d{9}$/.test(digits)) digits = `+90${digits.slice(1)}`;
  else if (/^5\d{9}$/.test(digits)) digits = `+90${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function phoneProblem(text: string): string | null {
  if (!text.trim()) return null;
  return cleanPhone(text) ? null : 'Write the phone number with its country code. Example: +90 532 123 45 67';
}

export const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';

export function passwordProblem(password: string): string | null {
  if (!password) return null;
  return password.length >= 8 && /\p{L}/u.test(password) && /\d/.test(password) ? null : PASSWORD_RULE;
}
