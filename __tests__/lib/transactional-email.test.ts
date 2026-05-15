import {
  buildTransactionalPlainText,
  escapeEmailHtml,
} from '@/lib/transactional-email';

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
