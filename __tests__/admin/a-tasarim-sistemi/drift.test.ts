/**
 * Tasarım uyum (drift) raporu — sayım birimleri + anlık görüntü üretici.
 *
 * `lib/data/design-drift.json` elle düzenlenmez; yeniden üretmek için:
 *   UPDATE_DESIGN_DRIFT=1 npx jest __tests__/admin/a-tasarim-sistemi/drift.test.ts
 * (Eşitlik zorlanmaz: rapor tarihli bir fotoğraftır, her sayfa değişikliğinde CI kırılmaz.)
 */
/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { areaOf, countDrift, scanDrift } from '@/lib/design-system/drift-scan';

const ROOT = path.resolve(__dirname, '../../..');
const FILE = path.join(ROOT, 'lib/data/design-drift.json');

describe('countDrift', () => {
  it('sınıf/stil içindeki sabit hex, ham palet ve küçük metni sayar; token sınıflarını saymaz', () => {
    const src = `
      const a = <div className="text-red-500 hover:bg-violet-600/20 text-danger bg-brand-subtle text-[10px] qx-caption" style={{ color: '#ff0000', background: "#abc" }} />;
    `;
    expect(countDrift(src)).toEqual({ hex: 2, palette: 2, tinyText: 1 });
  });

  it('yorumları ve ilgisiz # kullanımını saymaz', () => {
    const src = `
      // text-red-500 ve #ffffff yorumda
      /* bg-blue-600 */
      const href = '/x#core-web-vitals';
      const id = '#1';
    `;
    expect(countDrift(src)).toEqual({ hex: 0, palette: 0, tinyText: 0 });
  });

  it('alanı yoldan çıkarır', () => {
    expect(areaOf('app/admin/x/page.tsx')).toBe('admin');
    expect(areaOf(['app', 'customer', 'y.tsx'].join(String.fromCharCode(92)))).toBe('customer');
    expect(areaOf('components/ui/button.tsx')).toBe('components');
    expect(areaOf('app/(public)/page.tsx')).toBe('public');
  });
});

describe('design-drift.json', () => {
  it('anlık görüntü geçerli biçimde (gerekirse yeniden üretilir)', () => {
    if (process.env.UPDATE_DESIGN_DRIFT === '1') {
      const report = scanDrift(ROOT);
      fs.writeFileSync(FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
    }
    const committed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    expect(typeof committed.generatedAt).toBe('string');
    expect(committed.totals.clean).toBeLessThanOrEqual(committed.totals.files);
    const sum = committed.areas.reduce((a: number, r: { files: number }) => a + r.files, 0);
    expect(sum).toBe(committed.totals.files);
    expect(Array.isArray(committed.top)).toBe(true);
  });
});
