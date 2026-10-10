import { toSlugInput } from '@/app/admin/pages/slug';

describe('admin/pages slug dönüştürücü', () => {
  it('Türkçe harfleri ASCII’ye çevirir (eskiden ğ/ş/ı silinip "hakkmzda" oluyordu)', () => {
    expect(toSlugInput('Hakkımızda')).toBe('hakkimizda');
    expect(toSlugInput('Gizlilik Şartları')).toBe('gizlilik-sartlari');
    expect(toSlugInput('İletişim & Destek')).toBe('iletisim-destek');
    expect(toSlugInput('Çerez Politikası')).toBe('cerez-politikasi');
  });

  it('yazarken sondaki "-" korunur (kırpma kayıtta yapılır)', () => {
    expect(toSlugInput('hakkimizda-')).toBe('hakkimizda-');
    expect(toSlugInput('a--b')).toBe('a-b');
  });

  it('API şemasına uygun karakterler üretir', () => {
    expect(toSlugInput('Ürün <script> /?#')).toMatch(/^[a-z0-9-]*$/);
  });
});
