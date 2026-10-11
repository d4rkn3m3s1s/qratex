/**
 * Puan hızı kategori sınıflandırması (lib/points-velocity) — oyunlaştırma-ekonomi Y4.
 *
 * Güven Merkezi "puan hızı" taraması ve kullanıcı bazlı hız kontrolü tek seferlik ödülleri
 * (rozet 2.500–10.000, davet, görev, turnuva …) ve iade/transferleri saymaz; oyun kendi kovasında.
 * Bu test, puan basan HER kaynağın bilinçli sınıflandırıldığını zorlar: yeni bir `mintPoints`
 * kaynağı eklenince ya tekrarlanabilir (eşiğe sayılır) ya da muaf listesine gerekçesiyle girer.
 */
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { VELOCITY_EXEMPT_CATEGORIES, VELOCITY_GAME_CATEGORIES } from '@/lib/points-velocity';
import { ECONOMY_CAPS } from '@/lib/economy/caps';

/** Tekrarlanabilir, organik kazanç kaynakları — 24 saat eşiğine SAYILIR. */
const COUNTED = new Set(['feedback', 'review', 'dealer_passive', 'consumption', 'remedy', 'spin', 'surprise', 'automation']);

const ROOT = path.join(__dirname, '..', '..');
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '__tests__'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function mintSources(): Set<string> {
  const found = new Set<string>();
  for (const file of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /mintPoints\(\s*\w+\s*,\s*\{([\s\S]{0,600}?)\}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const s = /\bsource:\s*'([a-z_:.-]+)'/.exec(m[1]);
      if (s) found.add(s[1]);
    }
  }
  return found;
}

describe('puan hızı kategorileri', () => {
  it('tek seferlik ödüller ve iadeler muaf; oyun ayrı kovada', () => {
    for (const c of ['badge', 'referral', 'quest', 'tournament', 'streak', 'reversal', 'squad_escrow_refund', 'admin_adjust']) {
      expect(VELOCITY_EXEMPT_CATEGORIES).toContain(c);
    }
    expect(VELOCITY_GAME_CATEGORIES).toEqual(['game']);
    // Tavanlı (tekrarlanabilir) kategoriler muaf OLAMAZ.
    for (const c of Object.keys(ECONOMY_CAPS).filter((k) => k !== 'game')) {
      expect(VELOCITY_EXEMPT_CATEGORIES).not.toContain(c);
    }
  });

  it('puan basan her kaynak bilinçli sınıflandırılmış (yeni kaynak → bu listeye gerekçeyle eklenir)', () => {
    const sources = mintSources();
    expect(sources.size).toBeGreaterThan(10);
    const known = new Set([...COUNTED, ...VELOCITY_EXEMPT_CATEGORIES, ...VELOCITY_GAME_CATEGORIES]);
    expect([...sources].filter((s) => !known.has(s)).sort()).toEqual([]);
  });
});

describe('muaf kova tespitten kaçmaz (güvenlik regresyonu)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v = require('@/lib/points-velocity') as typeof import('@/lib/points-velocity');
  const ev = (category: string, points: number) => ({ category, data: { points } });
  it('dürüst tek seferlik efsanevi rozet + davet şüpheli değil', () => {
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest([ev('badge', 10_000), ev('referral', 200)]))).toBe(false);
  });
  it('sınırsız davet çiftliği / admin_adjust / savaş kazancı tavanı aşınca şüpheli', () => {
    const farm = Array.from({ length: 300 }, () => ev('referral', 100));
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest(farm))).toBe(true);
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest([ev('admin_adjust', 50_000)]))).toBe(true);
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest([ev('squad_battle', v.VELOCITY_ONE_OFF_BUCKET_LIMIT + 1)]))).toBe(true);
  });
  it('genel ve oyun eşikleri korunur', () => {
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest([ev('consumption', 500)]))).toBe(true);
    expect(v.isSuspiciousBuckets(v.__bucketizeForTest([ev('game', v.VELOCITY_GAME_BUCKET_LIMIT + 1)]))).toBe(true);
  });
});
