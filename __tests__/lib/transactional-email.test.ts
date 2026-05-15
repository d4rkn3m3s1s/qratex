import {
  buildTransactionalPlainText,
  escapeEmailHtml,
  canUseRemoteEmailImages,
  getTransactionalEmailLogoUrl,
  buildTransactionalEmailHtml,
} from '@/lib/transactional-email';

describe('canUseRemoteEmailImages / getTransactionalEmailLogoUrl', () => {
  it('rejects localhost origins (Gmail cannot fetch)', () => {
    expect(canUseRemoteEmailImages('http://localhost:3000')).toBe(false);
    expect(canUseRemoteEmailImages('http://127.0.0.1:3000')).toBe(false);
    expect(getTransactionalEmailLogoUrl('http://localhost:3000')).toBeNull();
  });

  it('allows public https origins for remote logo', () => {
    expect(canUseRemoteEmailImages('https://app.example.com')).toBe(true);
    expect(getTransactionalEmailLogoUrl('https://app.example.com')).toBe('https://app.example.com/logo/logo-light.png');
  });

  it('buildTransactionalEmailHtml omits remote img on localhost but still renders brand', () => {
    const html = buildTransactionalEmailHtml({
      heading: 'Test',
      bodyHtml: '<p>İçerik</p>',
      brandLinkHref: 'http://localhost:3000',
      logoUrl: getTransactionalEmailLogoUrl('http://localhost:3000'),
    });
    expect(html).not.toMatch(/<img[^>]+src=/);
    expect(html).toContain('QRATEX');
    expect(html).toContain('tx-email-card');
  });
});

describe('escapeEmailHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeEmailHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeEmailHtml('a&b')).toBe('a&amp;b');
    expect(escapeEmailHtml('"x"')).toBe('&quot;x&quot;');
  });
});

describe('buildTransactionalPlainText', () => {
  it('includes CTA URL and footer', () => {
    const text = buildTransactionalPlainText({
      heading: 'QRATEX',
      bodyLines: ['Merhaba,', 'Devam.'],
      cta: { href: 'https://example.com/verify?x=1', label: 'Doğrula' },
    });
    expect(text).toContain('QRATEX');
    expect(text).toContain('Merhaba,');
    expect(text).toContain('Doğrula: https://example.com/verify?x=1');
    expect(text).toContain('QRATEX - QR Tabanlı Geri Bildirim Platformu');
  });

  it('appends footnote lines before footer', () => {
    const text = buildTransactionalPlainText({
      heading: 'H',
      bodyLines: ['B'],
      footnoteLines: ['Not 1'],
    });
    expect(text).toContain('Not 1');
    expect(text).toMatch(/\n—\n/);
  });
});
