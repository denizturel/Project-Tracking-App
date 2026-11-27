import { cleanEmail, cleanPhone, emailProblem, joinName, passwordProblem, phoneProblem, splitName } from '@/lib/form-rules';

describe('the standard for names, email, phone and password', () => {
  it('splits and joins name and surname', () => {
    expect(splitName('Ayşe Nur Yılmaz')).toEqual({ first: 'Ayşe Nur', last: 'Yılmaz' });
    expect(splitName('Deniz')).toEqual({ first: 'Deniz', last: '' });
    expect(splitName(null)).toEqual({ first: '', last: '' });
    expect(joinName(' Ayşe  Nur ', ' Yılmaz ')).toBe('Ayşe Nur Yılmaz');
  });

  it('accepts real emails and saves them in small letters', () => {
    expect(cleanEmail('  Deniz@Example.COM ')).toBe('deniz@example.com');
    expect(emailProblem('deniz@example.com')).toBeNull();
    expect(emailProblem('deniz@example')).not.toBeNull();
    expect(emailProblem('deniz example.com')).not.toBeNull();
    expect(emailProblem('a@b..com')).not.toBeNull();
  });

  it('brings phone numbers to one form', () => {
    expect(cleanPhone('+90 (532) 123 45 67')).toBe('+905321234567');
    expect(cleanPhone('0532 123 45 67')).toBe('+905321234567');
    expect(cleanPhone('5321234567')).toBe('+905321234567');
    expect(cleanPhone('0049 151 2345 6789')).toBe('+4915123456789');
    expect(cleanPhone('12345')).toBeNull();
    expect(cleanPhone('phone')).toBeNull();
    expect(phoneProblem('')).toBeNull();
    expect(phoneProblem('123')).not.toBeNull();
  });

  it('asks for 8 characters with a capital letter, a small letter, a number and a symbol', () => {
    expect(passwordProblem('Abc1234!')).toBeNull();
    expect(passwordProblem('Şifre2026.')).toBeNull();
    expect(passwordProblem('abc12345')).not.toBeNull();
    expect(passwordProblem('abc1234!')).not.toBeNull();
    expect(passwordProblem('ABC1234!')).not.toBeNull();
    expect(passwordProblem('Abcdefg!')).not.toBeNull();
    expect(passwordProblem('Abc12345')).not.toBeNull();
    expect(passwordProblem('Ab1!')).not.toBeNull();
  });
});
