/**
 * Davranışsal rozet kuralları tek kaynak (lib/activity-badge-rules) — oyunlaştırma-ekonomi O3.
 * Davranış motorunun verdiği her rozetin kural metni var; katalog açıklaması bu metinden;
 * sürpriz motoru bu rozetleri değerlendirmez (tek sahip).
 */
import fs from 'fs';
import path from 'path';
import { ACTIVITY_BADGE_IDS, ACTIVITY_BADGE_RULES, ACTIVITY_BADGE_THRESHOLDS } from '@/lib/activity-badge-rules';
import { BADGE_CATALOG } from '@/lib/badge-catalog';

const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('davranışsal rozet kuralları', () => {
  it('motorun verdiği her rozet kimliği kural tablosunda (ve tersi)', () => {
    const code = src('lib/activity-badges.ts');
    const awarded = new Set<string>();
    for (const m of code.matchAll(/(?:candidates|fresh)\.push\('(badge-[a-z-]+)'\)/g)) awarded.add(m[1]);
    expect([...awarded].sort()).toEqual([...ACTIVITY_BADGE_IDS].sort());
  });

  it('katalog açıklaması gerçek eşikten (eski çelişkili metinler gitti)', () => {
    const byId = new Map(BADGE_CATALOG.map((b) => [b.id, b.description]));
    expect(byId.get('badge-firtina')).toBe(ACTIVITY_BADGE_RULES['badge-firtina']);
    expect(byId.get('badge-firtina')).toContain(String(ACTIVITY_BADGE_THRESHOLDS.firtinaBurstCount));
    expect(byId.get('badge-firtina')).not.toContain('7 gün');
    expect(byId.get('badge-usta-yorumcu')).toContain(String(ACTIVITY_BADGE_THRESHOLDS.ustaYorumcu));
    expect(byId.get('badge-copy-cv')).not.toContain('Profil');
  });

  it('sürpriz motoru davranışsal rozetleri atlar (tek sahip)', () => {
    const code = src('lib/surprise-badges.ts');
    expect(code).toMatch(/if \(ACTIVITY_BADGE_IDS\.has\(badge\.id\)\) continue;/);
  });
});
