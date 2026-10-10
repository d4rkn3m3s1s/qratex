import {
  nextAuthRedirect,
  resolvePostLoginTarget,
  roleHome,
  sanitizeCallbackPath,
} from '@/lib/auth/post-login-target';

const ORIGIN = 'https://app.qratex.com';

describe('resolvePostLoginTarget — saldırı vektörleri rol varsayılanına düşer', () => {
  const attacks: Array<[string, string]> = [
    ['ters bölü ile protokol-göreli', '/\\evil.com'],
    ['çift ters bölü', '\\\\evil.com'],
    ['yüzde-kodlu ters bölü', '/%5Cevil.com'],
    ['yüzde-kodlu ters bölü (küçük harf)', '/%5cevil.com'],
    ['protokol-göreli', '//evil.com'],
    ['protokol-göreli + yol', '//evil.com/phish?x=1'],
    ['kodlu çift eğik çizgi', '/%2F%2Fevil.com'],
    ['javascript: şeması', 'javascript:alert(1)'],
    ['büyük harfli javascript:', 'JaVaScRiPt:alert(document.cookie)'],
    ['boşluklu javascript:', '  javascript:alert(1)'],
    ['data: şeması', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript: şeması', 'vbscript:msgbox(1)'],
    ['başka köken https', 'https://evil.com'],
    ['başka köken http', 'http://evil.com/x'],
    ['alt alan adı benzeri', 'https://app.qratex.com.evil.com/'],
    ['kimlik bilgili URL', 'https://app.qratex.com@evil.com/'],
    ['aynı host farklı şema', 'http://app.qratex.com/customer'],
    ['sekme karakteri', '/\t/evil.com'],
    ['satır sonu', '/\n/evil.com'],
    ['kodlu sekme', '/%09/evil.com'],
    ['kodlu null', '/customer%00'],
    ['göreli (eğik çizgisiz)', 'evil.com/path'],
    ['üst dizin', '../admin'],
    ['yalnız sorgu', '?next=//evil.com'],
    ['bozuk yüzde kodlaması', '/%E0%A4%A'],
    ['API ucu', '/api/auth/signout'],
    ['giriş döngüsü', '/auth/login?callbackUrl=/customer'],
    ['kayıt döngüsü', '/auth/register'],
    ['aşırı uzun', `/${'a'.repeat(2050)}`],
  ];

  it.each(attacks)('%s → rol varsayılanı', (_label, raw) => {
    expect(resolvePostLoginTarget(raw, 'CUSTOMER', ORIGIN)).toBe('/customer');
  });

  it('rol bilinmiyorsa saldırıda kök yola düşer', () => {
    expect(resolvePostLoginTarget('//evil.com', null, ORIGIN)).toBe('/');
    expect(resolvePostLoginTarget('javascript:alert(1)', undefined, ORIGIN)).toBe('/');
  });
});

describe('resolvePostLoginTarget — meşru hedefler', () => {
  it('aynı kökenli göreli yolu korur (sorgu ve hash dahil)', () => {
    expect(resolvePostLoginTarget('/customer/rewards?tab=shop#top', 'CUSTOMER', ORIGIN)).toBe(
      '/customer/rewards?tab=shop#top'
    );
  });

  it('aynı kökenli mutlak URL yalnız yola indirgenir', () => {
    expect(resolvePostLoginTarget('https://app.qratex.com/dealer/reports?p=2', 'DEALER', ORIGIN)).toBe(
      '/dealer/reports?p=2'
    );
  });

  it('herkese açık sayfa her rol için geçerli', () => {
    expect(resolvePostLoginTarget('/c/abc123', 'CUSTOMER', ORIGIN)).toBe('/c/abc123');
    expect(resolvePostLoginTarget('/feedback/QR-1', 'DEALER', ORIGIN)).toBe('/feedback/QR-1');
  });

  it('başka rolün paneli → kendi paneli', () => {
    expect(resolvePostLoginTarget('/admin/users', 'CUSTOMER', ORIGIN)).toBe('/customer');
    expect(resolvePostLoginTarget('/admin-gate', 'DEALER', ORIGIN)).toBe('/dealer');
    expect(resolvePostLoginTarget('/customer', 'STAFF', ORIGIN)).toBe('/staff');
    expect(resolvePostLoginTarget('/dealer/scan', 'DEALER', ORIGIN)).toBe('/dealer/scan');
  });

  it('boş, null veya kök hedefte rol varsayılanı', () => {
    expect(resolvePostLoginTarget(null, 'ADMIN', ORIGIN)).toBe('/admin');
    expect(resolvePostLoginTarget('', 'DEALER', ORIGIN)).toBe('/dealer');
    expect(resolvePostLoginTarget('/', 'STAFF', ORIGIN)).toBe('/staff');
    expect(resolvePostLoginTarget(undefined, 'BILINMEYEN', ORIGIN)).toBe('/');
  });

  it('köken geçersizse yalnız göreli yol kabul edilir', () => {
    expect(resolvePostLoginTarget('/customer/wallet', 'CUSTOMER', '')).toBe('/customer/wallet');
    expect(resolvePostLoginTarget('https://app.qratex.com/customer', 'CUSTOMER', '')).toBe('/customer');
    expect(resolvePostLoginTarget('/customer/wallet', 'CUSTOMER', 'javascript:alert(1)')).toBe('/customer/wallet');
  });
});

describe('sanitizeCallbackPath', () => {
  it('e-postaya gömülecek güvenli yolu döndürür, saldırıda null', () => {
    expect(sanitizeCallbackPath('/customer/profile', ORIGIN)).toBe('/customer/profile');
    expect(sanitizeCallbackPath('/\\evil.com', ORIGIN)).toBeNull();
    expect(sanitizeCallbackPath('https://evil.com', ORIGIN)).toBeNull();
  });

  it('allowNonLandingPaths yalnız iniş sayfası kısıtını kaldırır, güvenlik süzgecini değil', () => {
    expect(sanitizeCallbackPath('/auth/login', ORIGIN, { allowNonLandingPaths: true })).toBe('/auth/login');
    expect(sanitizeCallbackPath('//evil.com', ORIGIN, { allowNonLandingPaths: true })).toBeNull();
  });
});

describe('nextAuthRedirect', () => {
  const baseUrl = 'https://app.qratex.com';
  it('güvenli yolu mutlak URL yapar', () => {
    expect(nextAuthRedirect({ url: '/customer', baseUrl })).toBe('https://app.qratex.com/customer');
    expect(nextAuthRedirect({ url: 'https://app.qratex.com/auth/login', baseUrl })).toBe(
      'https://app.qratex.com/auth/login'
    );
  });
  it('başka kökene asla yönlendirmez', () => {
    expect(nextAuthRedirect({ url: 'https://evil.com/x', baseUrl })).toBe(baseUrl);
    expect(nextAuthRedirect({ url: '/\\evil.com', baseUrl })).toBe(baseUrl);
    expect(nextAuthRedirect({ url: 'javascript:alert(1)', baseUrl })).toBe(baseUrl);
  });
});

describe('roleHome', () => {
  it('rol başına iniş sayfası', () => {
    expect(roleHome('ADMIN')).toBe('/admin');
    expect(roleHome('DEALER')).toBe('/dealer');
    expect(roleHome('CUSTOMER')).toBe('/customer');
    expect(roleHome('STAFF')).toBe('/staff');
    expect(roleHome('__proto__')).toBe('/');
    expect(roleHome(null)).toBe('/');
  });
});
