import { CHARACTER_PROFILES } from '@/lib/character-badges';

/**
 * KARAKTER ROZETİ KATEGORİ ALTYAPISI (genişletilebilir).
 *
 * Sistem iki aşamalı çalışır:
 *   1) AI kullanıcının yorum ÜSLUBUNU bir KATEGORİ'ye oturtur (Dram/Suç, Komedi…).
 *   2) O kategorinin karakterlerinden en uygun olanı seçer (character-badges.ts).
 *
 * Yeni kategori eklemek için: CHARACTER_CATEGORIES'e bir giriş ekle + o kategoriye
 * ait karakterlerin badgeId'lerini `characterIds`'e yaz. Karakter tanımları
 * (kişilik) zaten CHARACTER_PROFILES'te; burada yalnızca gruplama yapılır.
 *
 * Bir karakter yalnızca BİR kategoriye ait olmalı (AI seçimini netleştirir).
 * Hiçbir kategoriye atanmamış karakterler `fallback` kategorisine düşer.
 */

export interface CharacterCategory {
  /** Kısa, stabil anahtar (DB/analitik için) — asla değiştirme. */
  key: string;
  /** Kullanıcıya gösterilen ad. */
  name: string;
  /** Kategori teması / açıklaması (AI seçim ipucu + UI alt metni). */
  description: string;
  /** UI aksanı: emoji + renk (reveal ekranı ve rozet gruplaması bu paleti kullanır). */
  emoji: string;
  /** Tailwind/HSL uyumlu vurgu rengi (hex) — küre/kart temasında kullanılır. */
  accent: string;
  /** Bu kategorinin AI'a verilecek "ne zaman bu kategori" ipucu (Türkçe). */
  aiHint: string;
  /** Bu kategoriye ait karakter badgeId'leri (CHARACTER_PROFILES ile eşleşir). */
  characterIds: string[];
}

/**
 * KATEGORİLER — sıralama önemsiz. Yeni kategori buraya eklenir.
 * (Kullanıcının tarif ettiği 4 çekirdek kategori + ileride kolayca büyütülür.)
 */
export const CHARACTER_CATEGORIES: CharacterCategory[] = [
  {
    key: 'dram-suc',
    name: 'Dram / Suç',
    description: 'Ciddi, duygusal, olay örgülü anlatılar; haksızlık, ihmal veya hayal kırıklığı hikâyeleri.',
    emoji: '🎭',
    accent: '#dc2626',
    aiHint:
      'Yorum; mağduriyet, adaletsizlik, saygısızlık, ihmal, hak yeme, güven kaybı veya ciddi hayal kırıklığını ' +
      'ANLATI/HİKÂYE şeklinde işliyorsa (mizah yok, ciddi ve duygusal ton, geçmiş zaman + olay örgüsü) bu kategoridir.',
    characterIds: [
      'badge-walter-white', 'badge-tommy-shelby', 'badge-sherlock', 'badge-professor',
      'badge-michael-scofield', 'badge-elizabeth', 'badge-frank-underwood', 'badge-pablo-escobar',
      'badge-jesse-pinkman', 'badge-spartacus', 'badge-rome-julius', 'badge-tokyo',
    ],
  },
  {
    key: 'komedi',
    name: 'Komedi',
    description: 'Abartılı, esprili, güldürmeye yönelik; ironi ve mizah dolu yorumlar.',
    emoji: '😂',
    accent: '#f59e0b',
    aiHint:
      'Yorum abartılı, şaka amaçlı, güldürmeye yönelik, ironik/alaycı mizah içeriyorsa bu kategoridir. ' +
      'Ton eğlenceli, iğneleyici veya absürt.',
    characterIds: [
      'badge-chandler', 'badge-barney-stinson', 'badge-the-office', 'badge-rick-morty',
      'badge-tyrion', 'badge-house-md', 'badge-good-omens', 'badge-crowley', 'badge-dean-winchester',
    ],
  },
  {
    key: 'fantastik',
    name: 'Fantastik',
    description: 'Atmosfer, dekor, hayal gücü ve macera hissi öne çıkan; betimleyici, ilham veren yorumlar.',
    emoji: '🐉',
    accent: '#8b5cf6',
    aiHint:
      'Yorum atmosfer, dekor, ambiyans, hayal gücü, macera veya betimleme öne çıkararak yazılmışsa bu kategoridir. ' +
      'Vizyoner, ilham veren, epik veya destansı bir dil.',
    characterIds: [
      'badge-daenerys', 'badge-jon-snow', 'badge-khalesi', 'badge-witcher', 'badge-ragnar',
      'badge-eleven', 'badge-the-doctor', 'badge-castiel', 'badge-sam-winchester', 'badge-john-locke',
      'badge-sheldon', 'badge-carrie',
    ],
  },
  {
    key: 'gizem-gerilim',
    name: 'Gizem / Gerilim',
    description: 'Şüphe uyandıran, "bir şeyler dönüyor" hissi veren, tedirginlik verici gözlem yorumları.',
    emoji: '🕵️',
    accent: '#0ea5e9',
    aiHint:
      'Yorum şüphe uyandırıyor, "bir şeyler dönüyor" hissi veriyor, tedirgin edici veya gizemli bir gözlem ' +
      'içeriyorsa bu kategoridir. Karanlık, içe kapanık veya sorgulayıcı ton.',
    characterIds: [
      'badge-hannibal', 'badge-dexter', 'badge-joe', 'badge-villanelle', 'badge-wednesday',
      'badge-mr-robot', 'badge-dark-jonas', 'badge-martha', 'badge-kelly-yorkie', 'badge-this-is-us',
    ],
  },
];

/** key → kategori (hızlı erişim). */
export const CATEGORY_BY_KEY: Record<string, CharacterCategory> = Object.fromEntries(
  CHARACTER_CATEGORIES.map((c) => [c.key, c]),
);

/** badgeId → ait olduğu kategori (yoksa undefined). */
export const CATEGORY_BY_CHARACTER: Record<string, CharacterCategory> = (() => {
  const map: Record<string, CharacterCategory> = {};
  for (const cat of CHARACTER_CATEGORIES) {
    for (const id of cat.characterIds) map[id] = cat;
  }
  return map;
})();

/** Bir kategorinin karakter profillerini (kişilik tanımlarıyla) döndürür. */
export function charactersInCategory(categoryKey: string): { badgeId: string; name: string; trait: string }[] {
  const cat = CATEGORY_BY_KEY[categoryKey];
  if (!cat) return [];
  const idSet = new Set(cat.characterIds);
  return CHARACTER_PROFILES.filter((p) => idSet.has(p.badgeId));
}

/** Kategorisi olmayan karakterler için varsayılan (AI fallback güvenliği). */
export const FALLBACK_CATEGORY_KEY = 'dram-suc';

/**
 * Geliştirme/tutarlılık yardımcısı: her CHARACTER_PROFILES kaydının bir kategoriye
 * atanıp atanmadığını kontrol eder. Test veya dev-log için kullanılabilir.
 */
export function unassignedCharacterIds(): string[] {
  return CHARACTER_PROFILES.map((p) => p.badgeId).filter((id) => !CATEGORY_BY_CHARACTER[id]);
}
