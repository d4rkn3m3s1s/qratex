/**
 * P0-34 regresyon kalkanı: KVKK talebi hiçbir ekrandan elle "Tamamlandı" yapılamaz. Uyum ekranı
 * (eski /admin/compliance) emekliye ayrıldı ve /admin/privacy merkezine kalıcı yönlenir; merkezdeki
 * hiçbir bileşen PATCH status 'completed' göndermez (tamamlanma yalnız yürütme kanıtıyla).
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []
  );
}

describe('KVKK merkezi — talep elle kapatılamaz', () => {
  it("hiçbir bileşen status 'completed' göndermez", () => {
    for (const f of walk('components/admin/a-kvkk')) {
      const src = read(f);
      expect(src).not.toMatch(/status:\s*'completed'/);
      expect(src).not.toMatch(/method:\s*'PATCH'/);
    }
  });

  it('eski uyum ve talep sayfaları /admin/privacy merkezine kalıcı yönlenir', () => {
    for (const f of ['app/admin/compliance/page.tsx', 'app/admin/privacy-requests/page.tsx']) {
      const src = read(f);
      expect(src).toMatch(/permanentRedirect\(/);
      expect(src).toMatch(/\/admin\/privacy/);
    }
  });
});
