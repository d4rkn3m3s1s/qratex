/**
 * ⌘K veri sonuçlarının iniş adresleri (bilgi mimarisi B4c): her sonuç kendi kaydına iner,
 * hedef canlı bir yüzeydir (sayfa dosyası var, emekli koçanı değil), rolün yüzeyi olmayan
 * tür için `null` (sonuç gösterilmez).
 */
import * as fs from 'fs';
import * as path from 'path';
import { feedbackHref, productHref, qrHref, userHref, type SearchRole } from '@/lib/navigation/search-targets';
const { isRetirementStub } = require('@/lib/navigation/next-redirects') as { isRetirementStub: (file: string) => boolean };

function pageFile(href: string): string {
  const pathname = href.split('?')[0];
  const parts = pathname.split('/').filter(Boolean);
  const direct = path.join(process.cwd(), 'app', ...parts, 'page.tsx');
  if (fs.existsSync(direct)) return direct;
  // `/admin/users/<id>` → `app/admin/users/[id]/page.tsx`
  const dir = path.join(process.cwd(), 'app', ...parts.slice(0, -1));
  const dyn = fs.existsSync(dir) ? fs.readdirSync(dir).find((d) => /^\[[^.\]]+\]$/.test(d)) : undefined;
  return dyn ? path.join(dir, dyn, 'page.tsx') : direct;
}

const ROLES: SearchRole[] = ['ADMIN', 'DEALER', 'CUSTOMER'];

describe('global arama iniş adresleri', () => {
  const all = ROLES.flatMap((role) => [
    userHref(role, 'u1'),
    feedbackHref(role, 'f1'),
    productHref(role, 'Latte'),
    qrHref(role, { code: 'QR-1', dealerId: 'd1' }),
  ]).filter((h): h is string => h !== null);

  it.each(all)('%s canlı bir sayfaya iner (emekli koçanı değil)', (href) => {
    const file = pageFile(href);
    expect(fs.existsSync(file)).toBe(true);
    expect(isRetirementStub(file)).toBe(false);
  });

  it('kayda özgü: geri bildirim detay çekmecesi anahtarı, kullanıcı 360', () => {
    expect(feedbackHref('ADMIN', 'abc')).toBe('/admin/feedbacks?view=all&id=qr%3Aabc');
    expect(feedbackHref('DEALER', 'abc')).toBe('/dealer/inbox?id=qr-abc');
    expect(feedbackHref('CUSTOMER', 'abc')).toBe('/customer/me/voices?id=fb-abc');
    expect(userHref('ADMIN', 'u 1')).toBe('/admin/users/u%201');
  });

  it('rolün yüzeyi olmayan tür gösterilmez', () => {
    expect(userHref('DEALER', 'u1')).toBeNull();
    expect(userHref('CUSTOMER', 'u1')).toBeNull();
    expect(productHref('ADMIN', 'Latte')).toBeNull();
    expect(qrHref('CUSTOMER', { code: 'X', dealerId: 'd' })).toBeNull();
    expect(qrHref('ADMIN', { code: 'X', dealerId: null })).toBeNull();
  });

  it('müşteri ürün araması Ziyaretler sekmesine, sorgu kodlanmış', () => {
    expect(productHref('CUSTOMER', 'Çay & simit')).toBe('/customer/wallet/activity?tab=visits&q=%C3%87ay%20%26%20simit');
    expect(qrHref('ADMIN', { code: 'X', dealerId: 'd1' })).toBe('/admin/dealers-health?dealer=d1');
  });
});

import { cardHref } from '@/lib/navigation/search-targets';
import { scoreMatch, isSubsequence } from '@/lib/navigation/search';

describe('⌘K kart hedefi ve bulanık eşleşme', () => {
  it('kart token yalnız admin için', () => {
    expect(cardHref('ADMIN', 'abc123')).toBe('/admin/cards?q=abc123');
    expect(cardHref('DEALER', 'abc123')).toBeNull();
  });
  it('sıralı harf bulanık eşleşir, Türkçe duyarsız', () => {
    expect(isSubsequence('kllnc', 'kullanici')).toBe(true);
    expect(scoreMatch('kllnc', 'Kullanıcılar')).toBeGreaterThan(0);
    expect(scoreMatch('odul', 'Ödüller')).toBeGreaterThan(scoreMatch('odl', 'Ödüller'));
    expect(scoreMatch('xyz', 'Ödüller')).toBe(0);
  });
});
