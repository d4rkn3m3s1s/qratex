import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES } from '@/lib/character-badges';

/**
 * KOLEKSİYON BAŞARIMLARI (meta-başarım rozetleri).
 *
 * Karakter rozetleri (CHARACTER_PROFILES) yorumlara göre AI ile kazanılır ve GENEL
 * rozet listesinde GİZLİDİR. Bu dosyadaki başarımlar ise o koleksiyonun büyümesini
 * ÖDÜLLENDİREN, kullanıcının görebileceği "meta" rozetlerdir:
 *   • Belirli sayıda FARKLI karakter toplandığında,
 *   • Bir kategorideki TÜM karakterler toplandığında,
 *   • Belirli sayıda legendary karakter toplandığında,
 * özel bir rozet verilir (puan düşülmez — kazanılır).
 *
 * Bu meta rozetler CHARACTER_PROFILES'te DEĞİLDİR → gamification/badges API'sindeki
 * `notIn` filtresine EKLENMEZ, yani genel listede normal rozet gibi GÖRÜNÜR.
 * DB'de kayıt yoksa awardCollectionBadge otomatik oluşturur (prisma.badge.upsert,
 * requirement:{type:'collection'}). Böylece seed/migration gerekmez.
 *
 * Tasarım: hiçbir noktada puan LEDGER'ına dokunulmaz (yalnızca rozet + bildirim),
 * bu yüzden puan ekonomisi değişmezleri (escrow/net-zero, atomik one-time credit)
 * etkilenmez. İdempotent: aynı rozet ikinci kez atanmaz (@@unique[userId,badgeId]).
 */

export type CollectionAchievementType = 'count' | 'category' | 'rarity';

export interface CollectionAchievementDef {
  /** meta rozet badgeId (CHARACTER_PROFILES ile ÇAKIŞMAZ). */
  badgeId: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  type: CollectionAchievementType;
  /** count/rarity: eşik sayısı. category: o kategorideki karakter sayısı (hesaplanır). */
  threshold?: number;
  /** type==='category' için: hangi kategori (character-categories key). */
  categoryKey?: string;
  /** type==='rarity' için: hangi nadirlik sayılır (ör. 'legendary'). */
  rarityFilter?: 'common' | 'rare' | 'epic' | 'legendary';
}

// Meta rozet görselleri (mevcut set içinden tematik SVG'ler; yeni asset gerektirmez).
const B = '/images/badges';

/**
 * BAŞARIM TANIMLARI. Yeni başarım = buraya bir satır. `category` tipindeki eşik,
 * o kategorinin karakter sayısından otomatik türetilir (aşağıda doldurulur).
 */
export const COLLECTION_ACHIEVEMENTS: CollectionAchievementDef[] = [
  {
    badgeId: 'badge-koleksiyoncu',
    name: 'Koleksiyoncu',
    description: '5 farklı karakter rozeti topladın — koleksiyonun büyüyor!',
    icon: `${B}/sürpriz kutusu.svg`,
    rarity: 'rare',
    type: 'count',
    threshold: 5,
  },
  {
    badgeId: 'badge-karakter-avcisi',
    name: 'Karakter Avcısı',
    description: '10 farklı karakter rozeti topladın — gerçek bir avcısın!',
    icon: `${B}/XRAY.svg`,
    rarity: 'epic',
    type: 'count',
    threshold: 10,
  },
  {
    badgeId: 'badge-efsane-avcisi',
    name: 'Efsane Avcısı',
    description: '3 efsanevi (legendary) karakter topladın — efsaneleri avlıyorsun!',
    icon: `${B}/havai fişek.svg`,
    rarity: 'legendary',
    type: 'rarity',
    rarityFilter: 'legendary',
    threshold: 3,
  },
  // "Kategori Ustası" başarımları — her kategori için bir tane (eşik = o kategorinin
  // karakter sayısı, aşağıda türetilir). Kategori adı burada gömülü (UI Türkçe).
  {
    badgeId: 'badge-kategori-ustasi-dram-suc',
    name: 'Dram / Suç Ustası',
    description: 'Dram / Suç kategorisindeki TÜM karakterleri topladın!',
    icon: `${B}/TOMMY SHELBY.svg`,
    rarity: 'legendary',
    type: 'category',
    categoryKey: 'dram-suc',
  },
  {
    badgeId: 'badge-kategori-ustasi-komedi',
    name: 'Komedi Ustası',
    description: 'Komedi kategorisindeki TÜM karakterleri topladın!',
    icon: `${B}/CHANDLER BİİG.svg`,
    rarity: 'legendary',
    type: 'category',
    categoryKey: 'komedi',
  },
  {
    badgeId: 'badge-kategori-ustasi-fantastik',
    name: 'Fantastik Ustası',
    description: 'Fantastik kategorisindeki TÜM karakterleri topladın!',
    icon: `${B}/KHALESİ.svg`,
    rarity: 'legendary',
    type: 'category',
    categoryKey: 'fantastik',
  },
  {
    badgeId: 'badge-kategori-ustasi-gizem-gerilim',
    name: 'Gizem / Gerilim Ustası',
    description: 'Gizem / Gerilim kategorisindeki TÜM karakterleri topladın!',
    icon: `${B}/DEXTER.svg`,
    rarity: 'legendary',
    type: 'category',
    categoryKey: 'gizem-gerilim',
  },
];

/** meta rozet badgeId kümesi (gerekirse başka yerde "meta mı?" kontrolü için). */
export const COLLECTION_ACHIEVEMENT_IDS = COLLECTION_ACHIEVEMENTS.map((a) => a.badgeId);

/**
 * Bir meta başarım rozetini kullanıcıya atar (idempotent). DB'de badge kaydı yoksa
 * requirement:{type:'collection'} ile OLUŞTURUR — böylece genel listede görünür.
 * Puan/XP ledger'ına DOKUNMAZ (sadece rozet + opsiyonel bildirim). Yeni atandıysa true.
 */
async function awardCollectionBadge(userId: string, def: CollectionAchievementDef): Promise<boolean> {
  // Badge kaydı var mı? Yoksa katalogdan bağımsız olarak inline oluştur.
  let badge = await prisma.badge
    .findUnique({ where: { id: def.badgeId }, select: { id: true } })
    .catch(() => null);

  if (!badge) {
    badge = await prisma.badge
      .upsert({
        where: { id: def.badgeId },
        update: {},
        create: {
          id: def.badgeId,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: 'special',
          rarity: def.rarity,
          pointCost: null, // satın ALINAMAZ — yalnızca koleksiyonla kazanılır
          isActive: true,
          requirement: { type: 'collection' } as object,
        },
        select: { id: true },
      })
      .catch(() => null);
    if (!badge) return false;
  }

  // Zaten kazanılmış mı? (idempotent)
  const existing = await prisma.userBadge
    .findUnique({ where: { userId_badgeId: { userId, badgeId: def.badgeId } }, select: { id: true } })
    .catch(() => null);
  if (existing) return false;

  // Yarış koşulunda create P2002 verirse sessizce yut (idempotent kalır).
  const created = await prisma.userBadge
    .create({ data: { userId, badgeId: def.badgeId } })
    .then(() => true)
    .catch(() => false);
  if (!created) return false;

  // Bildirim (fire-and-forget; hata rozet atamayı bozmasın).
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: 'success',
        title: `🏆 Yeni başarım: ${def.name}!`,
        message: def.description,
        data: { kind: 'collection-achievement', badgeId: def.badgeId, href: '/customer/badges' } as object,
      },
    });
  } catch {
    /* bildirim başarısız olsa da rozet atandı */
  }
  return true;
}

/**
 * Kullanıcının karakter koleksiyonuna bakıp HAK EDİLEN koleksiyon başarımlarını verir.
 * revealReadyCategoryBadge içinden (yeni karakter atandıktan sonra) çağrılır — böylece
 * her yeni karakterde eşikler kontrol edilir. İdempotent + sessiz degradasyon (hata
 * karakter akışını bozmaz). Yeni atanan başarım adlarını döndürür (log/analitik için).
 */
export async function checkCollectionAchievements(userId: string): Promise<string[]> {
  try {
    const { CATEGORY_BY_KEY } = await import('@/lib/character-categories');
    const { BADGE_CATALOG } = await import('@/lib/badge-catalog');

    const charIds = CHARACTER_PROFILES.map((c) => c.badgeId);
    // Kullanıcının sahip olduğu KARAKTER rozetleri (meta rozetler hariç).
    const owned = await prisma.userBadge.findMany({
      where: { userId, badgeId: { in: charIds } },
      select: { badgeId: true },
    });
    const ownedIds = owned.map((o) => o.badgeId);
    const ownedSet = new Set(ownedIds);
    const distinctCount = ownedIds.length;

    // Nadirliğe göre sayım (badge-catalog rarity'sinden).
    const rarityById = new Map(BADGE_CATALOG.map((b) => [b.id, b.rarity]));

    const awarded: string[] = [];

    for (const def of COLLECTION_ACHIEVEMENTS) {
      let qualifies = false;

      if (def.type === 'count') {
        qualifies = distinctCount >= (def.threshold ?? Infinity);
      } else if (def.type === 'rarity') {
        const filter = def.rarityFilter ?? 'legendary';
        const count = ownedIds.filter((id) => rarityById.get(id) === filter).length;
        qualifies = count >= (def.threshold ?? Infinity);
      } else if (def.type === 'category' && def.categoryKey) {
        const cat = CATEGORY_BY_KEY[def.categoryKey];
        if (cat && cat.characterIds.length > 0) {
          qualifies = cat.characterIds.every((id) => ownedSet.has(id));
        }
      }

      if (qualifies) {
        const isNew = await awardCollectionBadge(userId, def);
        if (isNew) awarded.push(def.name);
      }
    }

    return awarded;
  } catch (err) {
    console.error('[COLLECTION_ACHIEVEMENT] check failed:', err);
    return [];
  }
}
