/**
 * /dealer/qr-codes saf kurallar + baskı motoru (SVG/PDF aynı yerleşim — rapor #46).
 */
import {
  checkPrintColors,
  deriveQrStatus,
  isExpiringSoon,
  linksFromSegmentConfig,
  normalizeQrFilters,
  printQuerySchema,
  qrUpdateSchema,
  statusWhere,
  segmentConfigFromLinks,
} from '@/lib/dealer/qr-codes/rules';
import { buildPrintPage, fitText, renderSvg } from '@/lib/dealer/qr-codes/print-layout';
import { encodePdfText, renderPdf } from '@/lib/dealer/qr-codes/pdf';
import { qrMatrix } from '@/lib/dealer/qr-codes/matrix';

const now = new Date('2026-10-11T09:00:00Z');
const base = { isActive: true, expiresAt: null, revokedAt: null, archivedAt: null };

describe('durum', () => {
  it('arşiv > iptal > süresi dolmuş > duraklatılmış > aktif', () => {
    expect(deriveQrStatus({ ...base, archivedAt: now, revokedAt: now }, now)).toBe('archived');
    expect(deriveQrStatus({ ...base, revokedAt: now }, now)).toBe('revoked');
    expect(deriveQrStatus({ ...base, isActive: false, expiresAt: '2026-10-01T00:00:00Z' }, now)).toBe('expired');
    expect(deriveQrStatus({ ...base, isActive: false }, now)).toBe('paused');
    expect(deriveQrStatus(base, now)).toBe('active');
  });
  it('süresi yaklaşan yalnız aktif kodlar', () => {
    expect(isExpiringSoon({ ...base, expiresAt: '2026-10-15T00:00:00Z' }, now)).toBe(true);
    expect(isExpiringSoon({ ...base, isActive: false, expiresAt: '2026-10-15T00:00:00Z' }, now)).toBe(false);
  });
  it('"aktif" süzgeci iptal/arşiv/süresi dolmuşları dışlar (rapor #11)', () => {
    expect(statusWhere('active', now)).toMatchObject({ archivedAt: null, revokedAt: null, isActive: true });
    expect(statusWhere('all', now)).toEqual({ archivedAt: null });
  });
  it('eski ?search= derin linki q olarak okunur; bozuk değerler varsayılana döner', () => {
    expect(normalizeQrFilters({ search: 'Teras', status: 'nope', page: '-3' })).toEqual({
      q: 'Teras',
      status: 'all',
      location: null,
      sort: 'newest',
      page: 1,
    });
  });
});

describe('bağlantılar ve düzenleme şeması', () => {
  it('segmentConfig ↔ bağlantılar gidiş-dönüş, bozuk girdiler atlanır', () => {
    const cfg = segmentConfigFromLinks([{ key: 'paket', welcomeText: 'Paket nasıldı?' }]);
    expect(linksFromSegmentConfig({ ...cfg, 'BOZUK ANAHTAR': { welcomeText: 'x' }, x: 5 })).toEqual([{ key: 'paket', welcomeText: 'Paket nasıldı?' }]);
    expect(segmentConfigFromLinks([])).toBeNull();
  });
  it('açıklama verilmeyen düzenleme açıklamayı temizlemez', () => {
    const r = qrUpdateSchema.parse({ name: 'Masa 2' });
    expect(r.description).toBeUndefined();
    expect(qrUpdateSchema.parse({ description: '' }).description).toBeNull();
  });
  it('aynı anahtar iki kez kullanılamaz', () => {
    expect(
      qrUpdateSchema.safeParse({ links: [{ key: 'a1', welcomeText: 'Merhaba' }, { key: 'a1', welcomeText: 'Selam' }] }).success
    ).toBe(false);
  });
});

describe('baskı renkleri', () => {
  it('ters ve düşük kontrast reddedilir', () => {
    expect(checkPrintColors('#FFFFFF', '#000000')).toMatchObject({ ok: false, reason: 'inverted' });
    expect(checkPrintColors('#BBBBBB', '#FFFFFF')).toMatchObject({ ok: false, reason: 'low_contrast' });
    expect(checkPrintColors('#111111', '#FFFFFF').ok).toBe(true);
  });
  it('baskı sorgusu en çok 50 kod alır ve kimlikleri tekilleştirir', () => {
    expect(printQuerySchema.parse({ ids: 'a,a,b' }).ids).toEqual(['a', 'b']);
    expect(printQuerySchema.safeParse({ ids: Array.from({ length: 51 }, (_, i) => `q${i}`).join(',') }).success).toBe(false);
  });
});

describe('baskı motoru', () => {
  const matrix = qrMatrix('https://qratex.com/feedback/ABCD1234');
  const input = {
    matrix,
    businessName: 'Çiğdem Şükrü Kahvesi',
    spotName: 'Masa 4',
    code: 'ABCD1234',
    host: 'qratex.com',
    style: { fg: '#111111', bg: '#FFFFFF', cta: '' },
  };

  it('uzun ad sığdırılır (küçültme, gerekirse kesme)', () => {
    const f = fitText('Çok çok çok uzun bir işletme adı ve devamı ve devamı ve devamı', 40, 7, 4, true);
    expect(f.size).toBeGreaterThanOrEqual(4);
    expect(f.text.endsWith('...')).toBe(true);
  });

  it('SVG: mm ölçülü, kaçışlı, şablon boyutları doğru', () => {
    const svg = renderSvg(buildPrintPage({ ...input, template: 'card', businessName: 'A & B <Kafe>' }));
    expect(svg).toContain('width="105mm" height="148mm"');
    expect(svg).toContain('A &amp; B &lt;Kafe&gt;');
    expect(svg).not.toContain('<script');
    expect(renderSvg(buildPrintPage({ ...input, template: 'tent' }))).toContain('rotate(180');
  });

  it('PDF: geçerli yapı, doğru xref ofsetleri, çok sayfa, Türkçe glifler', () => {
    const pages = [buildPrintPage({ ...input, template: 'card' }), buildPrintPage({ ...input, template: 'sticker' })];
    const bytes = renderPdf(pages, { title: 'Test' });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/Differences [128 /Gbreve /gbreve /Scedilla /scedilla /Idotaccent /dotlessi]');
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const offsets = text.slice(xref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // Akış uzunlukları gerçek uzunlukla eşleşir.
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) expect(text.slice(m.index + m[0].length + Number(m[1]), m.index + m[0].length + Number(m[1]) + 10)).toBe('\nendstream');
  });

  it('PDF yazı kodlaması: Türkçe harfler sekizli kodlara, parantezler kaçışlı', () => {
    expect(encodePdfText('Çiğ (ş)')).toBe('\\307i\\201 \\(\\203\\)');
    expect(encodePdfText('İı')).toBe('\\204\\205');
    expect(encodePdfText('😀')).toBe('?');
  });
});
