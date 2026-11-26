/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Sign-in must survive closing the app or the browser tab. These tests check how the
 * database client is set up on a phone and on the website, without talking to the server.
 */
const mockCreateClient = jest.fn((..._args: unknown[]) => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));

function load(os: 'ios' | 'android' | 'web') {
  jest.resetModules();
  mockCreateClient.mockClear();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_KEY = 'sb_publishable_test';
  require('@/lib/supabase');
  return mockCreateClient.mock.calls[0] as unknown as [string, string, { auth: Record<string, unknown> }];
}

describe('sign-in is remembered', () => {
  for (const os of ['ios', 'android'] as const) {
    it(`${os}: the session is saved in the phone's own storage and renewed`, () => {
      const [, , options] = load(os);
      const stand = require('@react-native-async-storage/async-storage');
      const storage = stand.default ?? stand;
      expect(options.auth.storage).toBe(storage);
      expect(options.auth.persistSession).toBe(true);
      expect(options.auth.autoRefreshToken).toBe(true);
      // A phone has no address bar to read a sign-in from.
      expect(options.auth.detectSessionInUrl).toBe(false);
    });
  }

  it('website: the session is kept by the browser and a Google sign-in coming back is picked up', () => {
    const [, , options] = load('web');
    expect(options.auth.storage).toBeUndefined();
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(true);
  });

  it('only the public address and the publishable key are given to the app', () => {
    const [url, key] = load('ios');
    expect(url).toBe('https://example.supabase.co');
    expect(key).toMatch(/^sb_publishable_/);
  });

  it('refuses to start without its settings instead of running half-configured', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(() => require('@/lib/supabase')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });
});
