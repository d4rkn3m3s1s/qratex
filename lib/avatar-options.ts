import { AVATAR_OPTIMIZED_MAP } from '@/lib/avatar-image-map.generated';

/**
 * Hazır avatar listesi. Buradaki yollar KİMLİK olarak kullanılır: kullanıcı seçtiğinde
 * `user.image` alanına bu yol yazılır ve canlı veritabanında binlerce kayıt bu değerleri
 * taşır — bu yüzden yollar DEĞİŞTİRİLMEZ.
 *
 * Görsel ağırlığı (P0/perf K2): dosyalar eskiden içine 1024 px PNG gömülü ~3,4 MB'lık
 * Illustrator SVG'leriydi. `scripts/optimize-images.mjs` aynı yoldaki dosyaları ~20 KB'lık
 * ince SVG'lerle (gömülü 512 px WebP) değiştirdi ve ayrıca içerik hash'li bağımsız WebP
 * üretti. Görüntülerken mümkünse `resolveAvatarImage()` kullanın: hash'li WebP 1 yıl
 * `immutable` önbelleğe alınır ve next/image tarafından boyutlandırılabilir.
 */
export const avatarList = [
  {
    category: 'Bayi',
    items: [
      '/images/avatar/BAYİ AVATAR ERKEK 1.svg',
      '/images/avatar/BAYİ AVATAR ERKEK 2.svg',
      '/images/avatar/BAYİ AVATAR ERKEK 3.svg',
      '/images/avatar/BAYİ AVATAR ERKEK 4.svg',
      '/images/avatar/BAYİ AVATAR ERKEK 5.svg',
      '/images/avatar/BAYİ AVATAR ERKEK 6.svg',
      '/images/avatar/BAYİ AVATAR KADIN 1.svg',
      '/images/avatar/BAYİ AVATAR KADIN 2.svg',
      '/images/avatar/BAYİ AVATAR KADIN 3.svg',
      '/images/avatar/BAYİ AVATAR KADIN 4.svg',
      '/images/avatar/BAYİ AVATAR KADIN 5.svg',
      '/images/avatar/BAYİ AVATAR KADIN 6.svg',
    ],
  },
  {
    category: 'Erkek',
    items: [
      '/images/avatar/AVATAR ERKEK 1.svg',
      '/images/avatar/AVATAR ERKEK 2.svg',
      '/images/avatar/AVATAR ERKEK 3.svg',
      '/images/avatar/AVATAR ERKEK 4.svg',
      '/images/avatar/AVATAR ERKEK 5.svg',
      '/images/avatar/AVATAR ERKEK 6.svg',
      '/images/avatar/AVATAR ERKEK 8.svg',
      '/images/avatar/AVATAR ERKEK 9.svg',
      '/images/avatar/AVATAR ERKEK 10.svg',
      '/images/avatar/AVATAR ERKEK 11.svg',
      '/images/avatar/AVATAR ERKEK 12.svg',
    ],
  },
  {
    category: 'Kadın',
    items: [
      '/images/avatar/AVATAR KADIN 1.svg',
      '/images/avatar/AVATAR KADIN 2.svg',
      '/images/avatar/AVATAR KADIN 3.svg',
      '/images/avatar/AVATAR KADIN 4.svg',
      '/images/avatar/AVATAR KADIN 6.svg',
      '/images/avatar/AVATAR KADIN 7.svg',
      '/images/avatar/AVATAR KADIN 8.svg',
      '/images/avatar/AVATAR KADIN 9.svg',
      '/images/avatar/AVATAR KADIN 10.svg',
      '/images/avatar/KADIN2.svg',
    ],
  },
  {
    category: 'Hayvanlar',
    items: [
      '/images/avatar/CAT.svg',
      '/images/avatar/DOG.svg',
      '/images/avatar/ELEPHANT.svg',
      '/images/avatar/FROG.svg',
      '/images/avatar/KOALA.svg',
      '/images/avatar/LİON.svg',
      '/images/avatar/MONKEY.svg',
      '/images/avatar/PANDA.svg',
      '/images/avatar/SHEEP.svg',
      '/images/avatar/TİGER.svg',
      '/images/avatar/ZÜRAFA.svg',
    ],
  },
  {
    category: 'Meyveler',
    items: [
      '/images/avatar/APPLE.svg',
      '/images/avatar/AVACADO.svg',
      '/images/avatar/BANANA.svg',
      '/images/avatar/BLUEBERRY.svg',
      '/images/avatar/CHERRRY.svg',
      '/images/avatar/DRAGON FRUİT.svg',
      '/images/avatar/GRAPE.svg',
      '/images/avatar/ORANGE.svg',
      '/images/avatar/STRAWBERRY.svg',
      '/images/avatar/WATERMELON.svg',
    ],
  },
  {
    category: 'Yiyecekler',
    items: [
      '/images/avatar/COFFFE.svg',
      '/images/avatar/DONUT.svg',
      '/images/avatar/DRİNKS.svg',
      '/images/avatar/FRİES.svg',
      '/images/avatar/HAMBURGER.svg',
      '/images/avatar/İCE CREAM.svg',
      '/images/avatar/PİZZ.svg',
    ],
  },
  {
    category: 'Emojiler',
    items: [
      '/images/avatar/EMOJİ1.svg',
      '/images/avatar/EMOJİ2.svg',
      '/images/avatar/EMOJİ3.svg',
      '/images/avatar/EMOJİ4.svg',
      '/images/avatar/EMOJİ5.svg',
      '/images/avatar/EMOJİ6.svg',
      '/images/avatar/EMOJİ7.svg',
      '/images/avatar/EMOJİ8.svg',
    ],
  },
  {
    category: 'Diğer',
    items: ['/images/avatar/CPW.svg'],
  },
] as const;

export const defaultAvatars = avatarList.flatMap((category) => category.items);

/** `/images/avatar/AVATAR%20ERKEK%201.svg?x=1` → `/images/avatar/AVATAR ERKEK 1.svg` (NFC). */
function normalizeAvatarPath(src: string): string {
  let path = src.trim();
  // Aynı origin'li mutlak URL'ler (ör. e-posta/OG için üretilmiş) de eşlensin.
  const originMatch = path.match(/^https?:\/\/[^/]+(\/images\/avatar\/.*)$/i);
  if (originMatch) path = originMatch[1];
  path = path.split(/[?#]/, 1)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Bozuk yüzde kodlaması: olduğu gibi bırak.
  }
  return path.normalize('NFC');
}

/**
 * Hazır avatar yolunu içerik hash'li, optimize WebP yoluna çevirir.
 * Hazır avatar değilse (yüklenmiş görsel, OAuth fotoğrafı, R2 URL'si) girdiyi aynen döner;
 * boş girdide null döner.
 */
export function resolveAvatarImage(src: string | null | undefined): string | null {
  if (!src) return null;
  const optimized = AVATAR_OPTIMIZED_MAP[normalizeAvatarPath(src)];
  return optimized ?? src;
}

/** Değer hazır avatar listesinden mi? (eşleşmede kodlama/boşluk farkları yok sayılır) */
export function isPresetAvatar(src: string | null | undefined): boolean {
  if (!src) return false;
  return Object.prototype.hasOwnProperty.call(AVATAR_OPTIMIZED_MAP, normalizeAvatarPath(src));
}
