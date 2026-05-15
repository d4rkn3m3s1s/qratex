import { safePostLoginRedirect } from '@/lib/safe-callback-url';

describe('safePostLoginRedirect', () => {
  const origin = 'https://app.example.com';

  it('allows same-origin relative paths', () => {
    expect(safePostLoginRedirect('/dealer', origin)).toBe('/dealer');
    expect(safePostLoginRedirect('/dealer?x=1', origin)).toBe('/dealer?x=1');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safePostLoginRedirect('//evil.com/phish', origin)).toBeUndefined();
  });

  it('rejects other-origin absolute URLs', () => {
    expect(safePostLoginRedirect('https://evil.com/', origin)).toBeUndefined();
  });

  it('normalizes same-origin absolute URLs to path+query+hash', () => {
    expect(safePostLoginRedirect('https://app.example.com/customer/profile', origin)).toBe('/customer/profile');
    expect(safePostLoginRedirect('https://app.example.com/a?q=1#h', origin)).toBe('/a?q=1#h');
  });

  it('returns undefined for empty or overly long input', () => {
    expect(safePostLoginRedirect('', origin)).toBeUndefined();
    expect(safePostLoginRedirect('   ', origin)).toBeUndefined();
    expect(safePostLoginRedirect(null, origin)).toBeUndefined();
    expect(safePostLoginRedirect('a'.repeat(2050), origin)).toBeUndefined();
  });

  it('returns undefined when allowedOrigin is not a valid http(s) base for absolute URLs', () => {
    expect(safePostLoginRedirect('https://app.example.com/x', '')).toBeUndefined();
  });
});
