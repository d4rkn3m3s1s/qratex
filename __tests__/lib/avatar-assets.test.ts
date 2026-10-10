/**
 * Performans K2 — avatar varlıkları. Eski durum: 1024 px PNG gömülü ~3,4 MB'lık SVG'ler
 * (70 dosya, 226 MB); liderlik tablosu tek açılışta ~181 MB indiriyordu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { avatarList, defaultAvatars, isPresetAvatar, resolveAvatarImage } from '@/lib/avatar-options';
import { AVATAR_OPTIMIZED_MAP } from '@/lib/avatar-image-map.generated';
import { LEAGUE_AVATARS, getLeagueAvatarUrl } from '@/lib/league-avatars';

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');
const fileFor = (url: string) => path.join(PUBLIC_DIR, ...url.replace(/^\//, '').split('/'));

describe('avatar varlık bütçesi', () => {
  it.each(defaultAvatars.map((a) => [a]))('%s: eski yol hâlâ var ve 100 KB altında (DB uyumluluğu)', (url) => {
    const file = fileFor(url);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeLessThan(100 * 1024);
  });

  it('her hazır avatarın hash’li WebP’si var ve 60 KB altında', () => {
    for (const url of defaultAvatars) {
      const opt = resolveAvatarImage(url);
      expect(opt).toMatch(/^\/images\/avatar\/opt\/[a-z0-9-]+\.[0-9a-f]{10}\.webp$/);
      const file = fileFor(opt!);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(60 * 1024);
    }
  });

  it('liderlik tablosu senaryosu: 50 varsayılan avatarın toplamı 1,5 MB altında (eskiden ~181 MB)', () => {
    const total = Array.from({ length: 50 }, (_, i) => defaultAvatars[i % defaultAvatars.length]).reduce(
      (sum, url) => sum + fs.statSync(fileFor(url)).size,
      0,
    );
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('eşleme tablosu avatar listesiyle bire bir', () => {
    expect(Object.keys(AVATAR_OPTIMIZED_MAP).sort()).toEqual([...defaultAvatars].map((a) => a.normalize('NFC')).sort());
    expect(avatarList.length).toBeGreaterThan(0);
  });
});

describe('resolveAvatarImage', () => {
  it('URL kodlanmış ve mutlak biçimleri de çözer (DB’de farklı biçimler olabilir)', () => {
    const expected = resolveAvatarImage('/images/avatar/BAYİ AVATAR KADIN 6.svg');
    expect(expected).toMatch(/bayi-avatar-kadin-6\.[0-9a-f]+\.webp$/);
    expect(resolveAvatarImage('/images/avatar/BAY%C4%B0%20AVATAR%20KADIN%206.svg')).toBe(expected);
    expect(resolveAvatarImage('https://qratex.app/images/avatar/BAY%C4%B0%20AVATAR%20KADIN%206.svg?v=2')).toBe(expected);
    // NFD (ayrışık) İ yazımı
    expect(resolveAvatarImage('/images/avatar/BAYİ AVATAR KADIN 6.svg'.normalize('NFD'))).toBe(expected);
  });

  it('hazır avatar olmayan değerleri aynen döner; boşta null', () => {
    expect(resolveAvatarImage('https://lh3.googleusercontent.com/a/abc')).toBe('https://lh3.googleusercontent.com/a/abc');
    expect(resolveAvatarImage('/images/uploads/x.png')).toBe('/images/uploads/x.png');
    expect(resolveAvatarImage('%E0%A4%A')).toBe('%E0%A4%A');
    expect(resolveAvatarImage(null)).toBeNull();
    expect(resolveAvatarImage('')).toBeNull();
    expect(isPresetAvatar('/images/avatar/CAT.svg')).toBe(true);
    expect(isPresetAvatar('/images/uploads/x.png')).toBe(false);
  });

  it('lig avatarları optimize WebP döner', () => {
    for (const key of Object.keys(LEAGUE_AVATARS)) {
      expect(getLeagueAvatarUrl(key)).toMatch(/^\/images\/avatar\/opt\/.+\.webp$/);
    }
    expect(getLeagueAvatarUrl('BILINMEYEN')).toBe(getLeagueAvatarUrl('BASLANGIC'));
  });
});
